import type { SQLiteDatabase } from 'expo-sqlite';

import { SQLiteUploadQueueStore, UPLOAD_QUEUE_SCHEMA_SQL } from '../services/sqliteUploadQueueStore';

describe('SQLiteUploadQueueStore', () => {
  test('schema persists queue state but never credentials', async () => {
    const execAsync = jest.fn(async () => undefined);
    const database = { execAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await store.initialize();

    expect(execAsync).toHaveBeenCalledWith(UPLOAD_QUEUE_SCHEMA_SQL);
    expect(UPLOAD_QUEUE_SCHEMA_SQL).toContain('file_uri TEXT NOT NULL');
    expect(UPLOAD_QUEUE_SCHEMA_SQL).not.toMatch(/username|password|credential/i);
  });

  test('reconciles interrupted uploading rows into retryable failures', async () => {
    const runAsync = jest.fn(async (_sql: string, _params: unknown[]) => ({ changes: 2, lastInsertRowId: 0 }));
    const database = { runAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await expect(store.reconcileInterrupted()).resolves.toBe(2);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'failed'"),
      [expect.any(String)],
    );
    expect(runAsync.mock.calls[0][0]).toContain("WHERE status = 'uploading'");
    expect(runAsync.mock.calls[0][0]).toContain('Tap retry to continue');
  });

  test('hydrates durable media and accepted state after relaunch', async () => {
    const getAllAsync = jest.fn(async () => [{
      assignment_id: 'assignment-7',
      created_at: '2026-09-06T12:00:00.000Z',
      error_message: null,
      file_name: 'photo.heic',
      file_uri: 'file:///documents/upload-queue/photo.heic',
      id: 'queue-7',
      mime_type: 'image/heic',
      progress: 100,
      source: 'library',
      status: 'accepted',
      updated_at: '2026-09-06T12:01:00.000Z',
    }]);
    const database = { getAllAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await expect(store.list()).resolves.toEqual([expect.objectContaining({
      assignmentId: 'assignment-7',
      fileUri: 'file:///documents/upload-queue/photo.heic',
      source: 'library',
      status: 'accepted',
    })]);
  });
});
