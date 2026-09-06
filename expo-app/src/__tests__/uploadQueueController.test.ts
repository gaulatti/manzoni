import type {
  ColomboCredentials,
  ColomboUploader,
  CredentialsStore,
  DurableMediaStore,
  NewUploadQueueItem,
  UploadQueueItem,
  UploadQueueStore,
} from '../domain/uploadQueue';
import { enqueueSelectedMedia, UploadQueueController } from '../services/uploadQueueController';

const NOW = '2026-09-06T12:00:00.000Z';

function queueItem(overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    assignmentId: null,
    createdAt: NOW,
    errorMessage: null,
    fileName: 'photo.jpg',
    fileUri: 'file:///documents/upload-queue/photo.jpg',
    id: 'queue-1',
    mimeType: 'image/jpeg',
    progress: 0,
    source: 'camera',
    status: 'pending',
    updatedAt: NOW,
    ...overrides,
  };
}

class MemoryQueueStore implements UploadQueueStore {
  constructor(public items: UploadQueueItem[] = []) {}
  initialize = jest.fn(async () => undefined);

  async reconcileInterrupted() {
    let changed = 0;
    this.items = this.items.map((item) => {
      if (item.status !== 'uploading') return item;
      changed += 1;
      return { ...item, errorMessage: 'Upload interrupted. Tap retry to continue.', progress: 0, status: 'failed' };
    });
    return changed;
  }

  async list() { return this.items.map((item) => ({ ...item })); }
  async insert(item: NewUploadQueueItem) { this.items.push(queueItem({ ...item, updatedAt: item.createdAt })); }
  async markUploading(id: string) { this.patch(id, { errorMessage: null, progress: 0, status: 'uploading' }); }
  async updateProgress(id: string, progress: number) {
    if (this.items.find((item) => item.id === id)?.status === 'uploading') this.patch(id, { progress });
  }
  async markAccepted(id: string, assignmentId: string) { this.patch(id, { assignmentId, progress: 100, status: 'accepted' }); }
  async markFailed(id: string, message: string) { this.patch(id, { errorMessage: message, progress: 0, status: 'failed' }); }
  async retry(id: string) { this.patch(id, { assignmentId: null, errorMessage: null, progress: 0, status: 'pending' }); }
  async retryAll() { this.items.filter((item) => item.status === 'failed').forEach((item) => this.patch(item.id, { status: 'pending' })); }
  async clearAccepted() {
    const accepted = this.items.filter((item) => item.status === 'accepted');
    this.items = this.items.filter((item) => item.status !== 'accepted');
    return accepted;
  }
  private patch(id: string, patch: Partial<UploadQueueItem>) {
    this.items = this.items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: NOW } : item);
  }
}

const noCredentials: CredentialsStore = { load: async () => null, save: async () => undefined };
const credentials: ColomboCredentials = {
  baseUrl: 'https://colombo.test',
  password: 'test-password',
  username: 'test-user',
};

function runtime(
  store: MemoryQueueStore,
  options: {
    credentialsStore?: CredentialsStore;
    mediaStore?: DurableMediaStore;
    uploader?: ColomboUploader;
  } = {},
) {
  return new UploadQueueController(
    store,
    options.mediaStore ?? {
      persist: async (item, id) => ({ fileName: `${id}.jpg`, fileUri: `file:///documents/${id}.jpg`, mimeType: item.mimeType ?? 'image/jpeg' }),
      reconcile: async () => 0,
      remove: async () => undefined,
    },
    options.credentialsStore ?? noCredentials,
    options.uploader ?? { upload: async () => ({ assignmentId: 'unused', status: 'accepted' }) },
    (() => { let value = 0; return () => `queue-${++value}`; })(),
    () => new Date(NOW),
  );
}

describe('UploadQueueController', () => {
  test('hydrates persisted rows and makes interrupted uploads retryable', async () => {
    const store = new MemoryQueueStore([queueItem({ status: 'uploading' })]);
    const controller = runtime(store);

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      interruptedCount: 1,
      items: [expect.objectContaining({ errorMessage: expect.stringContaining('retry'), status: 'failed' })],
    });
  });

  test('camera and library use the same durable-copy-before-insert path', async () => {
    const events: string[] = [];
    const store = new MemoryQueueStore();
    const insert = store.insert.bind(store);
    store.insert = async (item) => { events.push(`insert:${item.source}:${item.fileUri}`); await insert(item); };
    const mediaStore: DurableMediaStore = {
      persist: async (_item, id) => {
        events.push(`copy:${id}`);
        return { fileName: `${id}.jpg`, fileUri: `file:///documents/${id}.jpg`, mimeType: 'image/jpeg' };
      },
      reconcile: async () => 0,
      remove: async () => undefined,
    };
    const controller = runtime(store, { mediaStore });
    await controller.initialize();

    await enqueueSelectedMedia(controller, 'camera', [{ uri: 'file:///cache/camera.jpg' }]);
    await enqueueSelectedMedia(controller, 'library', [{ uri: 'file:///cache/library.jpg' }]);

    expect(events).toEqual([
      'copy:queue-1',
      'insert:camera:file:///documents/queue-1.jpg',
      'copy:queue-2',
      'insert:library:file:///documents/queue-2.jpg',
    ]);
    expect(store.items.map((item) => item.source)).toEqual(['camera', 'library']);
  });

  test('reconciles orphaned durable media against persisted queue rows on startup', async () => {
    const store = new MemoryQueueStore([queueItem({ fileUri: 'file:///documents/upload-queue/kept.jpg' })]);
    const reconcile = jest.fn(async () => 1);
    const controller = runtime(store, {
      mediaStore: {
        persist: async () => ({ fileName: 'unused.jpg', fileUri: 'file:///unused.jpg', mimeType: 'image/jpeg' }),
        reconcile,
        remove: async () => undefined,
      },
    });

    await controller.initialize();

    expect(reconcile).toHaveBeenCalledWith(['file:///documents/upload-queue/kept.jpg']);
  });

  test('retry transitions a failed item through uploading to accepted', async () => {
    const store = new MemoryQueueStore([queueItem({ errorMessage: 'offline', status: 'failed' })]);
    const uploader: ColomboUploader = {
      upload: jest.fn(async (_item, suppliedCredentials, onProgress): Promise<{ assignmentId: string; status: 'accepted' }> => {
        expect(suppliedCredentials).toEqual(credentials);
        onProgress(63);
        return { assignmentId: 'assignment-9', status: 'accepted' };
      }),
    };
    const controller = runtime(store, { credentialsStore: { load: async () => credentials, save: async () => undefined }, uploader });
    await controller.initialize();

    await controller.retry('queue-1');

    expect(uploader.upload).toHaveBeenCalledTimes(1);
    expect(store.items[0]).toMatchObject({ assignmentId: 'assignment-9', errorMessage: null, progress: 100, status: 'accepted' });
  });

  test('processes work enqueued while a serial upload is active', async () => {
    const store = new MemoryQueueStore([queueItem({ id: 'queue-1' })]);
    let releaseFirstUpload: (() => void) | undefined;
    const firstUploadBlocked = new Promise<void>((resolve) => {
      releaseFirstUpload = resolve;
    });
    let markFirstUploadStarted: (() => void) | undefined;
    const firstUploadStarted = new Promise<void>((resolve) => {
      markFirstUploadStarted = resolve;
    });
    const uploader: ColomboUploader = {
      upload: jest.fn(async (item): Promise<{ assignmentId: string; status: 'accepted' }> => {
        if (item.id === 'queue-1') {
          markFirstUploadStarted?.();
          await firstUploadBlocked;
        }
        return { assignmentId: `assignment-${item.id}`, status: 'accepted' };
      }),
    };
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      uploader,
    });

    const processing = controller.processPending();
    await firstUploadStarted;
    store.items.push(queueItem({ id: 'queue-2' }));
    await controller.processPending();
    releaseFirstUpload?.();
    await processing;

    expect(uploader.upload).toHaveBeenCalledTimes(2);
    expect(store.items).toEqual([
      expect.objectContaining({ id: 'queue-1', status: 'accepted' }),
      expect.objectContaining({ id: 'queue-2', status: 'accepted' }),
    ]);
  });
});
