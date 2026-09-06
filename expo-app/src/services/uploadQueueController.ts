import {
  applyReceiptOutcome,
  canRetryUpload,
  isDeletable,
  reconcilableItems,
} from '../domain/reconciliation';
import type {
  ColomboReceipts,
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
  isReconciling: boolean;
  items: UploadQueueItem[];
}

/**
 * Why a reconciliation pass ran. Delivery is only ever learned from a receipt,
 * so these are the moments worth asking — never a timer that assumes an answer.
 */
export type ReconcileTrigger = 'start' | 'foreground' | 'connectivity' | 'user';

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
  private isReconciling = false;
  private reconciling: Promise<void> | null = null;
  private items: UploadQueueItem[] = [];
  private readonly listeners = new Set<Listener>();
  private processRequested = false;

  constructor(
    private readonly store: UploadQueueStore,
    private readonly mediaStore: DurableMediaStore,
    private readonly credentialsStore: CredentialsStore,
    private readonly uploader: ColomboUploader,
    private readonly receipts: ColomboReceipts,
    private readonly idFactory: () => string = createQueueId,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getSnapshot(): UploadQueueSnapshot {
    return {
      activeError: this.activeError,
      interruptedCount: this.interruptedCount,
      isProcessing: this.isProcessing,
      isReconciling: this.isReconciling,
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
    const persisted = await this.store.list();
    await this.mediaStore.reconcile(persisted.map((item) => item.fileUri));
    await this.refresh();
    void this.processPending();
    void this.reconcile('start');
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

  /**
   * Re-uploads one row. Refused while Colombo may still be working on it: a
   * transient status failure must not become a duplicate delivery.
   */
  async retry(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item && !canRetryUpload(item)) {
      this.activeError = 'This upload is still with Colombo. Refresh its status before uploading again.';
      this.emit();
      return;
    }
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

  /**
   * Removes the rows Colombo has finished with, at the user's request. A row
   * whose delivery is unknown or still in flight is kept, so nothing is deleted
   * on the strength of silence.
   */
  async clearSettled(): Promise<void> {
    const settled = (await this.store.list()).filter(isDeletable);
    if (settled.length === 0) {
      await this.refresh();
      return;
    }
    await Promise.all(settled.map((item) => this.mediaStore.remove(item.fileUri)));
    await this.store.remove(settled.map((item) => item.id));
    await this.refresh();
  }

  /**
   * Polls Colombo for the delivery receipts of rows it still owns.
   *
   * Runs on launch, foreground, connectivity restoration, and user refresh. A
   * user refresh ignores backoff; every other trigger respects it.
   */
  async reconcile(trigger: ReconcileTrigger = 'user'): Promise<void> {
    // A caller arriving mid-pass awaits that pass rather than silently getting
    // nothing: a user tapping refresh should see the result either way.
    if (this.reconciling) return this.reconciling;
    this.reconciling = this.runReconcile(trigger);
    try {
      await this.reconciling;
    } finally {
      this.reconciling = null;
    }
  }

  private async runReconcile(trigger: ReconcileTrigger): Promise<void> {
    this.isReconciling = true;
    this.emit();

    try {
      const credentials = await this.credentialsStore.load();
      if (!credentials) return;

      const now = this.now();
      const persisted = await this.store.list();
      const due = trigger === 'user'
        ? persisted.filter((item) => item.operationId && !isDeletable(item))
        : reconcilableItems(persisted, now);

      for (const item of due) {
        if (!item.operationId) continue;
        const outcome = await this.receipts.fetchReceipt(item.operationId, credentials);
        await this.store.recordServerState(item.id, applyReceiptOutcome(item, outcome, this.now()));
      }
      await this.refresh();
    } catch {
      // A reconciliation failure leaves every row exactly as it was: unknown
      // delivery is retried, never resolved into failure or success.
    } finally {
      this.isReconciling = false;
      this.emit();
    }
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
          await this.store.markAccepted(item.id, accepted.assignmentId, accepted.operationId);
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
