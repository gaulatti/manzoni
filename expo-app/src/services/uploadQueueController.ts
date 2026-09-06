import type {
  ColomboUploader,
  CredentialsStore,
  DurableMediaStore,
  MediaSource,
  SelectedMedia,
  UploadQueueItem,
  UploadQueueStore,
} from '../domain/uploadQueue';

export interface UploadQueueSnapshot {
  activeError: string | null;
  interruptedCount: number;
  isProcessing: boolean;
  items: UploadQueueItem[];
}

type Listener = (snapshot: UploadQueueSnapshot) => void;

function createQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function safeUploadError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith('Colombo rejected the upload with HTTP ')) return error.message;
    if (error.message === 'The queued media copy is no longer available.') return error.message;
    if (error.message === 'Colombo returned an invalid accepted-upload receipt.') return error.message;
  }
  return 'Upload failed. Check the connection and retry.';
}

export class UploadQueueController {
  private activeError: string | null = null;
  private interruptedCount = 0;
  private isProcessing = false;
  private items: UploadQueueItem[] = [];
  private readonly listeners = new Set<Listener>();
  private processRequested = false;

  constructor(
    private readonly store: UploadQueueStore,
    private readonly mediaStore: DurableMediaStore,
    private readonly credentialsStore: CredentialsStore,
    private readonly uploader: ColomboUploader,
    private readonly idFactory: () => string = createQueueId,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getSnapshot(): UploadQueueSnapshot {
    return {
      activeError: this.activeError,
      interruptedCount: this.interruptedCount,
      isProcessing: this.isProcessing,
      items: [...this.items],
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    this.interruptedCount = await this.store.reconcileInterrupted();
    await this.refresh();
    void this.processPending();
  }

  async enqueue(source: MediaSource, selected: SelectedMedia[]): Promise<void> {
    for (const item of selected) {
      const id = this.idFactory();
      const persisted = await this.mediaStore.persist(item, id);
      try {
        const createdAt = this.now().toISOString();
        await this.store.insert({
          createdAt,
          fileName: persisted.fileName,
          fileUri: persisted.fileUri,
          id,
          mimeType: persisted.mimeType,
          source,
        });
      } catch (error) {
        await this.mediaStore.remove(persisted.fileUri);
        throw error;
      }
    }

    this.activeError = null;
    await this.refresh();
    void this.processPending();
  }

  async retry(id: string): Promise<void> {
    await this.store.retry(id);
    this.activeError = null;
    await this.refresh();
    await this.processPending();
  }

  async retryAll(): Promise<void> {
    await this.store.retryAll();
    this.activeError = null;
    await this.refresh();
    await this.processPending();
  }

  async clearAccepted(): Promise<void> {
    const accepted = (await this.store.list()).filter((item) => item.status === 'accepted');
    await Promise.all(accepted.map((item) => this.mediaStore.remove(item.fileUri)));
    await this.store.clearAccepted();
    await this.refresh();
  }

  async processPending(): Promise<void> {
    if (this.isProcessing) {
      this.processRequested = true;
      return;
    }
    this.isProcessing = true;
    this.activeError = null;
    this.emit();

    try {
      const credentials = await this.credentialsStore.load();
      if (!credentials) {
        if (this.items.some((item) => item.status === 'pending')) {
          this.activeError = 'Configure Colombo credentials to start pending uploads.';
        }
        return;
      }

      const pending = (await this.store.list())
        .filter((item) => item.status === 'pending')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

      for (const item of pending) {
        await this.store.markUploading(item.id);
        await this.refresh();

        try {
          const accepted = await this.uploader.upload(item, credentials, (progress) => {
            void this.persistProgress(item.id, progress).catch(() => undefined);
          });
          await this.store.markAccepted(item.id, accepted.assignmentId);
        } catch (error) {
          await this.store.markFailed(item.id, safeUploadError(error));
        }
        await this.refresh();
      }
    } catch {
      this.activeError = 'Queue processing could not continue. Try again when the device is ready.';
    } finally {
      const shouldProcessAgain = this.processRequested;
      this.processRequested = false;
      this.isProcessing = false;
      this.emit();
      if (shouldProcessAgain) {
        await this.processPending();
      }
    }
  }

  dismissError(): void {
    this.activeError = null;
    this.emit();
  }

  private async persistProgress(id: string, progress: number): Promise<void> {
    await this.store.updateProgress(id, progress);
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.items = await this.store.list();
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export async function enqueueSelectedMedia(
  controller: Pick<UploadQueueController, 'enqueue'>,
  source: MediaSource,
  selected: SelectedMedia[],
): Promise<void> {
  await controller.enqueue(source, selected);
}
