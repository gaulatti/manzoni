import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  NewUploadQueueItem,
  ServerStateUpdate,
  UploadQueueItem,
  UploadQueueStore,
} from '../domain/uploadQueue';

export const UPLOAD_QUEUE_SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS upload_queue (
    id TEXT PRIMARY KEY NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('camera', 'library')),
    file_uri TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'accepted', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    assignment_id TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS upload_queue_status_created_idx
    ON upload_queue (status, created_at);
`;

/**
 * Delivery-receipt columns.
 *
 * `operation_id` is Colombo's key for the receipt; the rest is the last thing a
 * receipt said, so a relaunch resumes reconciliation from what it already knew
 * instead of re-polling every row from scratch. Applied with `ADD COLUMN`, so an
 * install created before this release keeps its rows and its media.
 */
export const UPLOAD_RECEIPT_MIGRATION_SQL = `
  ALTER TABLE upload_queue ADD COLUMN operation_id TEXT;
  ALTER TABLE upload_queue ADD COLUMN server_state TEXT;
  ALTER TABLE upload_queue ADD COLUMN server_state_at TEXT;
  ALTER TABLE upload_queue ADD COLUMN server_failure_code TEXT;
  ALTER TABLE upload_queue ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE upload_queue ADD COLUMN next_reconcile_at TEXT;
  CREATE INDEX IF NOT EXISTS upload_queue_reconcile_idx
    ON upload_queue (operation_id, server_state, next_reconcile_at);
`;

/** Schema generation this store expects. Bump alongside a new migration. */
export const UPLOAD_QUEUE_SCHEMA_VERSION = 1;

interface UploadQueueRow {
  assignment_id: string | null;
  created_at: string;
  error_message: string | null;
  file_name: string;
  file_uri: string;
  id: string;
  mime_type: string;
  next_reconcile_at: string | null;
  operation_id: string | null;
  progress: number;
  reconcile_attempts: number | null;
  server_failure_code: string | null;
  server_state: string | null;
  server_state_at: string | null;
  source: UploadQueueItem['source'];
  status: UploadQueueItem['status'];
  updated_at: string;
}

function hydrate(row: UploadQueueRow): UploadQueueItem {
  return {
    assignmentId: row.assignment_id,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    fileName: row.file_name,
    fileUri: row.file_uri,
    id: row.id,
    mimeType: row.mime_type,
    nextReconcileAt: row.next_reconcile_at ?? null,
    operationId: row.operation_id ?? null,
    progress: row.progress,
    reconcileAttempts: row.reconcile_attempts ?? 0,
    serverFailureCode: (row.server_failure_code as UploadQueueItem['serverFailureCode']) ?? null,
    serverState: (row.server_state as UploadQueueItem['serverState']) ?? null,
    serverStateAt: row.server_state_at ?? null,
    source: row.source,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export class SQLiteUploadQueueStore implements UploadQueueStore {
  constructor(private readonly database: SQLiteDatabase) {}

  async initialize(): Promise<void> {
    await this.database.execAsync(UPLOAD_QUEUE_SCHEMA_SQL);
    const version = await this.database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) >= UPLOAD_QUEUE_SCHEMA_VERSION) return;
    await this.database.execAsync(UPLOAD_RECEIPT_MIGRATION_SQL);
    await this.database.execAsync(`PRAGMA user_version = ${UPLOAD_QUEUE_SCHEMA_VERSION}`);
  }

  async reconcileInterrupted(): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'failed', progress = 0,
           error_message = 'Upload interrupted. Tap retry to continue.', updated_at = ?
       WHERE status = 'uploading'`,
      [now],
    );
    return result.changes;
  }

  async list(): Promise<UploadQueueItem[]> {
    const rows = await this.database.getAllAsync<UploadQueueRow>(
      `SELECT id, source, file_uri, file_name, mime_type, status, progress,
              assignment_id, error_message, created_at, updated_at,
              operation_id, server_state, server_state_at, server_failure_code,
              reconcile_attempts, next_reconcile_at
       FROM upload_queue
       ORDER BY created_at DESC, id DESC`,
    );
    return rows.map(hydrate);
  }

  async insert(item: NewUploadQueueItem): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO upload_queue
         (id, source, file_uri, file_name, mime_type, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [
        item.id,
        item.source,
        item.fileUri,
        item.fileName,
        item.mimeType,
        item.createdAt,
        item.createdAt,
      ],
    );
  }

  async markUploading(id: string): Promise<void> {
    await this.update(id, "status = 'uploading', progress = 0, error_message = NULL");
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const bounded = Math.max(0, Math.min(99, Math.round(progress)));
    await this.database.runAsync(
      `UPDATE upload_queue SET progress = ?, updated_at = ?
       WHERE id = ? AND status = 'uploading'`,
      [bounded, new Date().toISOString(), id],
    );
  }

  async markAccepted(id: string, assignmentId: string, operationId: string): Promise<void> {
    const now = new Date().toISOString();
    // Accepted is recorded as exactly that: Colombo's own state, due for a
    // first reconciliation immediately. Delivery is not assumed here.
    await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'accepted', progress = 100, assignment_id = ?, operation_id = ?,
           server_state = 'accepted', server_state_at = ?, server_failure_code = NULL,
           reconcile_attempts = 0, next_reconcile_at = NULL,
           error_message = NULL, updated_at = ?
       WHERE id = ?`,
      [assignmentId, operationId, now, now, id],
    );
  }

  async recordServerState(id: string, update: ServerStateUpdate): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue
       SET server_state = ?, server_state_at = ?, server_failure_code = ?,
           reconcile_attempts = ?, next_reconcile_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        update.serverState,
        update.serverStateAt,
        update.failureCode,
        update.reconcileAttempts,
        update.nextReconcileAt,
        update.serverStateAt,
        id,
      ],
    );
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'failed', progress = 0, error_message = ?, updated_at = ?
       WHERE id = ?`,
      [message, new Date().toISOString(), id],
    );
  }

  async retry(id: string): Promise<void> {
    await this.update(
      id,
      `status = 'pending', progress = 0, assignment_id = NULL, error_message = NULL,
       operation_id = NULL, server_state = NULL, server_state_at = NULL,
       server_failure_code = NULL, reconcile_attempts = 0, next_reconcile_at = NULL`,
      "status = 'failed'",
    );
  }

  async retryAll(): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'pending', progress = 0, assignment_id = NULL,
           error_message = NULL, operation_id = NULL, server_state = NULL,
           server_state_at = NULL, server_failure_code = NULL,
           reconcile_attempts = 0, next_reconcile_at = NULL, updated_at = ?
       WHERE status = 'failed'`,
      [new Date().toISOString()],
    );
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.database.runAsync(
      `DELETE FROM upload_queue WHERE id IN (${placeholders})`,
      [...ids],
    );
  }

  private async update(id: string, assignments: string, condition = '1 = 1'): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue SET ${assignments}, updated_at = ? WHERE id = ? AND ${condition}`,
      [new Date().toISOString(), id],
    );
  }
}
