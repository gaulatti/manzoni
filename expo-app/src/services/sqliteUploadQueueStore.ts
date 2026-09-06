import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  NewUploadQueueItem,
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

interface UploadQueueRow {
  assignment_id: string | null;
  created_at: string;
  error_message: string | null;
  file_name: string;
  file_uri: string;
  id: string;
  mime_type: string;
  progress: number;
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
    progress: row.progress,
    source: row.source,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export class SQLiteUploadQueueStore implements UploadQueueStore {
  constructor(private readonly database: SQLiteDatabase) {}

  async initialize(): Promise<void> {
    await this.database.execAsync(UPLOAD_QUEUE_SCHEMA_SQL);
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
              assignment_id, error_message, created_at, updated_at
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

  async markAccepted(id: string, assignmentId: string): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'accepted', progress = 100, assignment_id = ?,
           error_message = NULL, updated_at = ?
       WHERE id = ?`,
      [assignmentId, new Date().toISOString(), id],
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
      "status = 'pending', progress = 0, assignment_id = NULL, error_message = NULL",
      "status = 'failed'",
    );
  }

  async retryAll(): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue
       SET status = 'pending', progress = 0, assignment_id = NULL,
           error_message = NULL, updated_at = ?
       WHERE status = 'failed'`,
      [new Date().toISOString()],
    );
  }

  async clearAccepted(): Promise<UploadQueueItem[]> {
    const accepted = (await this.list()).filter((item) => item.status === 'accepted');
    await this.database.runAsync("DELETE FROM upload_queue WHERE status = 'accepted'");
    return accepted;
  }

  private async update(id: string, assignments: string, condition = '1 = 1'): Promise<void> {
    await this.database.runAsync(
      `UPDATE upload_queue SET ${assignments}, updated_at = ? WHERE id = ? AND ${condition}`,
      [new Date().toISOString(), id],
    );
  }
}
