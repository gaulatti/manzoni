import type {
  AcceptedUpload,
  ColomboCredentials,
  ColomboReceipts,
  ColomboUploader,
  CredentialsStore,
  DurableMediaStore,
  NewUploadQueueItem,
  ServerStateUpdate,
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
    nextReconcileAt: null,
    operationId: null,
    progress: 0,
    reconcileAttempts: 0,
    serverFailureCode: null,
    serverState: null,
    serverStateAt: null,
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
  async markAccepted(id: string, assignmentId: string, operationId: string) {
    this.patch(id, { assignmentId, operationId, progress: 100, serverState: 'accepted', serverStateAt: NOW, status: 'accepted' });
  }
  recordServerState = jest.fn(async (id: string, update: ServerStateUpdate) => {
    this.patch(id, {
      nextReconcileAt: update.nextReconcileAt,
      reconcileAttempts: update.reconcileAttempts,
      serverFailureCode: update.failureCode,
      serverState: update.serverState,
      serverStateAt: update.serverStateAt,
    });
  });
  async markFailed(id: string, message: string) { this.patch(id, { errorMessage: message, progress: 0, status: 'failed' }); }
  async retry(id: string) {
    this.patch(id, {
      assignmentId: null, errorMessage: null, nextReconcileAt: null, operationId: null,
      progress: 0, reconcileAttempts: 0, serverFailureCode: null, serverState: null,
      serverStateAt: null, status: 'pending',
    });
  }
  async retryAll() { this.items.filter((item) => item.status === 'failed').forEach((item) => this.patch(item.id, { status: 'pending' })); }
  async remove(ids: readonly string[]) {
    this.items = this.items.filter((item) => !ids.includes(item.id));
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
    receipts?: ColomboReceipts;
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
    options.uploader ?? { upload: async () => ({ assignmentId: 'unused', operationId: 'operation-unused', status: 'accepted' }) },
    options.receipts ?? { fetchReceipt: async () => ({ kind: 'unavailable' as const }) },
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
      upload: jest.fn(async (_item, suppliedCredentials, onProgress): Promise<AcceptedUpload> => {
        expect(suppliedCredentials).toEqual(credentials);
        onProgress(63);
        return { assignmentId: 'assignment-9', operationId: 'operation-9', status: 'accepted' };
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
      upload: jest.fn(async (item): Promise<AcceptedUpload> => {
        if (item.id === 'queue-1') {
          markFirstUploadStarted?.();
          await firstUploadBlocked;
        }
        return { assignmentId: `assignment-${item.id}`, operationId: `operation-${item.id}`, status: 'accepted' };
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

  test('a relaunch resumes reconciliation for rows Colombo still owns', async () => {
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', operationId: 'operation-1', serverState: 'accepted', status: 'accepted' }),
      queueItem({ id: 'queue-2', operationId: 'operation-2', serverState: 'callback-confirmed', status: 'accepted' }),
      queueItem({ id: 'queue-3', operationId: null, status: 'pending' }),
    ]);
    const fetchReceipt = jest.fn(async () => ({
      kind: 'receipt' as const,
      receipt: {
        assignmentId: 'assignment-1', callbackAttempts: 0, expiresAt: null, failureCode: null,
        operationId: 'operation-1', state: 'delivered' as const, updatedAt: NOW, uploadAttempts: 1,
      },
    }));
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      receipts: { fetchReceipt },
    });

    await controller.initialize();
    await controller.reconcile('start');

    // Only the row that is still in flight is polled: the confirmed one is
    // terminal and the pending one was never accepted.
    expect(fetchReceipt).toHaveBeenCalledTimes(1);
    expect(fetchReceipt).toHaveBeenCalledWith('operation-1', credentials);
    expect(store.items.find((row) => row.id === 'queue-1')).toMatchObject({ serverState: 'delivered' });
  });

  test('a status outage leaves delivery unknown and never marks the row failed', async () => {
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', operationId: 'operation-1', serverState: 'accepted', status: 'accepted' }),
    ]);
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      receipts: { fetchReceipt: async () => ({ kind: 'unavailable' as const }) },
    });
    await controller.initialize();

    await controller.reconcile('connectivity');

    const row = store.items[0];
    expect(row.serverState).toBe('unknown');
    expect(row.status).toBe('accepted');
    expect(row.reconcileAttempts).toBeGreaterThan(0);
  });

  test('a transient status failure cannot duplicate the upload', async () => {
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', operationId: 'operation-1', serverState: 'unknown', status: 'accepted' }),
    ]);
    const upload = jest.fn();
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      uploader: { upload: upload as never },
    });
    await controller.initialize();

    await controller.retry('queue-1');

    expect(upload).not.toHaveBeenCalled();
    expect(store.items[0]).toMatchObject({ operationId: 'operation-1', status: 'accepted' });
    expect(controller.getSnapshot().activeError).toMatch(/still with Colombo/i);
  });

  test('a terminally failed operation may be uploaded again as a new operation', async () => {
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', operationId: 'operation-1', serverFailureCode: 'retry_exhausted', serverState: 'failed', status: 'accepted' }),
    ]);
    const upload = jest.fn(async () => ({ assignmentId: 'assignment-2', operationId: 'operation-2', status: 'accepted' as const }));
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      uploader: { upload },
    });
    await controller.initialize();

    await controller.retry('queue-1');

    expect(upload).toHaveBeenCalledTimes(1);
    expect(store.items[0]).toMatchObject({ operationId: 'operation-2', serverState: 'accepted', status: 'accepted' });
  });

  test('a user refresh ignores backoff; a background trigger respects it', async () => {
    const future = new Date(Date.parse(NOW) + 600_000).toISOString();
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', nextReconcileAt: future, operationId: 'operation-1', serverState: 'unknown', status: 'accepted' }),
    ]);
    const fetchReceipt = jest.fn(async () => ({ kind: 'unavailable' as const }));
    const controller = runtime(store, {
      credentialsStore: { load: async () => credentials, save: async () => undefined },
      receipts: { fetchReceipt },
    });
    await controller.initialize();
    fetchReceipt.mockClear();

    await controller.reconcile('foreground');
    expect(fetchReceipt).not.toHaveBeenCalled();

    await controller.reconcile('user');
    expect(fetchReceipt).toHaveBeenCalledTimes(1);
  });

  test('retention removes only rows the server has finished with', async () => {
    const removed: string[] = [];
    const store = new MemoryQueueStore([
      queueItem({ id: 'settled', operationId: 'operation-1', serverState: 'callback-confirmed', status: 'accepted' }),
      queueItem({ id: 'in-flight', operationId: 'operation-2', serverState: 'accepted', status: 'accepted' }),
      queueItem({ id: 'unknown', operationId: 'operation-3', serverState: 'unknown', status: 'accepted' }),
    ]);
    const controller = runtime(store, {
      mediaStore: {
        persist: async (_item, id) => ({ fileName: `${id}.jpg`, fileUri: `file:///documents/${id}.jpg`, mimeType: 'image/jpeg' }),
        reconcile: async () => 0,
        remove: async (fileUri) => { removed.push(fileUri); },
      },
    });
    await controller.initialize();

    await controller.clearSettled();

    expect(store.items.map((row) => row.id).sort()).toEqual(['in-flight', 'unknown']);
    expect(removed).toHaveLength(1);
  });

  test('reconciliation does nothing without credentials rather than guessing', async () => {
    const store = new MemoryQueueStore([
      queueItem({ id: 'queue-1', operationId: 'operation-1', serverState: 'accepted', status: 'accepted' }),
    ]);
    const fetchReceipt = jest.fn(async () => ({ kind: 'unavailable' as const }));
    const controller = runtime(store, { receipts: { fetchReceipt } });
    await controller.initialize();

    await controller.reconcile('user');

    expect(fetchReceipt).not.toHaveBeenCalled();
    expect(store.items[0].serverState).toBe('accepted');
  });
});
