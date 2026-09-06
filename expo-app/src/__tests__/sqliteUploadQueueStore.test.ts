import type { SQLiteDatabase } from 'expo-sqlite';

import {
  SQLiteUploadQueueStore,
  UPLOAD_QUEUE_SCHEMA_SQL,
  UPLOAD_QUEUE_SCHEMA_VERSION,
  UPLOAD_RECEIPT_MIGRATION_SQL,
} from '../services/sqliteUploadQueueStore';

describe('SQLiteUploadQueueStore', () => {
  test('schema persists queue state but never credentials', async () => {
    const execAsync = jest.fn(async () => undefined);
    const getFirstAsync = jest.fn(async () => ({ user_version: 0 }));
    const database = { execAsync, getFirstAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await store.initialize();

    expect(execAsync).toHaveBeenCalledWith(UPLOAD_QUEUE_SCHEMA_SQL);
    expect(UPLOAD_QUEUE_SCHEMA_SQL).toContain('file_uri TEXT NOT NULL');
    expect(UPLOAD_QUEUE_SCHEMA_SQL).not.toMatch(/username|password|credential/i);
    expect(UPLOAD_RECEIPT_MIGRATION_SQL).not.toMatch(/username|password|credential/i);
  });

  test('an install created before delivery receipts is migrated, once', async () => {
    const execAsync = jest.fn(async () => undefined);
    const getFirstAsync = jest.fn(async () => ({ user_version: 0 }));
    const database = { execAsync, getFirstAsync } as unknown as SQLiteDatabase;

    await new SQLiteUploadQueueStore(database).initialize();

    expect(execAsync).toHaveBeenCalledWith(UPLOAD_RECEIPT_MIGRATION_SQL);
    expect(execAsync).toHaveBeenCalledWith(`PRAGMA user_version = ${UPLOAD_QUEUE_SCHEMA_VERSION}`);
    // ADD COLUMN keeps existing rows and their durable media copies.
    expect(UPLOAD_RECEIPT_MIGRATION_SQL).toContain('ADD COLUMN operation_id');
    expect(UPLOAD_RECEIPT_MIGRATION_SQL).not.toMatch(/DROP|DELETE/i);
  });

  test('an already-migrated install is not migrated again', async () => {
    const execAsync = jest.fn(async () => undefined);
    const getFirstAsync = jest.fn(async () => ({ user_version: UPLOAD_QUEUE_SCHEMA_VERSION }));
    const database = { execAsync, getFirstAsync } as unknown as SQLiteDatabase;

    await new SQLiteUploadQueueStore(database).initialize();

    expect(execAsync).toHaveBeenCalledTimes(1);
    expect(execAsync).not.toHaveBeenCalledWith(UPLOAD_RECEIPT_MIGRATION_SQL);
  });

  test('accepted records Colombo state and an operation id, never delivery', async () => {
    const runAsync = jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 }));
    const database = { runAsync } as unknown as SQLiteDatabase;

    await new SQLiteUploadQueueStore(database).markAccepted('queue-1', 'assignment-7', 'operation-7');

    const [sql, params] = runAsync.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("server_state = 'accepted'");
    expect(sql).not.toMatch(/delivered|callback/i);
    expect(params).toEqual(['assignment-7', 'operation-7', expect.any(String), expect.any(String), 'queue-1']);
  });

  test('a retry clears the operation so a new upload is a new operation', async () => {
    const runAsync = jest.fn(async (_sql: string, _params: unknown[]) => ({ changes: 1, lastInsertRowId: 0 }));
    const database = { runAsync } as unknown as SQLiteDatabase;

    await new SQLiteUploadQueueStore(database).retry('queue-1');

    expect(runAsync.mock.calls[0][0]).toContain('operation_id = NULL');
    expect(runAsync.mock.calls[0][0]).toContain('server_state = NULL');
  });

  test('removal names exactly the rows the caller decided to delete', async () => {
    const runAsync = jest.fn(async () => ({ changes: 2, lastInsertRowId: 0 }));
    const database = { runAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await store.remove(['queue-1', 'queue-2']);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM upload_queue WHERE id IN (?, ?)'),
      ['queue-1', 'queue-2'],
    );

    runAsync.mockClear();
    await store.remove([]);
    expect(runAsync).not.toHaveBeenCalled();
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
      next_reconcile_at: null,
      operation_id: 'operation-7',
      progress: 100,
      reconcile_attempts: 0,
      server_failure_code: null,
      server_state: 'accepted',
      server_state_at: '2026-09-06T12:01:00.000Z',
      source: 'library',
      status: 'accepted',
      updated_at: '2026-09-06T12:01:00.000Z',
    }]);
    const database = { getAllAsync } as unknown as SQLiteDatabase;
    const store = new SQLiteUploadQueueStore(database);

    await expect(store.list()).resolves.toEqual([expect.objectContaining({
      assignmentId: 'assignment-7',
      fileUri: 'file:///documents/upload-queue/photo.heic',
      operationId: 'operation-7',
      serverState: 'accepted',
      source: 'library',
      status: 'accepted',
    })]);
  });
});
