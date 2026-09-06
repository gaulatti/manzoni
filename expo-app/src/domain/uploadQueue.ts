export type MediaSource = 'camera' | 'library';

/**
 * The local queue status: what this device knows about its own attempt.
 * `accepted` means Colombo took responsibility for the file — it does not mean
 * the file was delivered.
 */
export type UploadStatus = 'pending' | 'uploading' | 'accepted' | 'failed';

/**
 * The bounded states Colombo's receipt contract reports, exactly as they appear
 * on the wire (`GET /uploads/{operationId}`, kebab-case).
 */
export type ColomboUploadState =
  | 'accepted'
  | 'uploading'
  | 'delivered'
  | 'callback-confirmed'
  | 'failed'
  | 'expired';

/** Colombo's bounded failure vocabulary, snake_case on the wire. */
export type ColomboFailureCode =
  | 'corrupt_content'
  | 'dependency_denied'
  | 'invalid_metadata'
  | 'retry_exhausted'
  | 'tenant_missing';

/**
 * What this device last learned from a receipt. `unknown` is a real, retryable
 * answer — it is never rendered as failed or delivered.
 */
export type ServerState = ColomboUploadState | 'unknown';

/** The receipt document returned by `GET /uploads/{operationId}`. */
export interface ColomboReceipt {
  assignmentId: string;
  callbackAttempts: number;
  expiresAt: string | null;
  failureCode: ColomboFailureCode | null;
  operationId: string;
  state: ColomboUploadState;
  updatedAt: string;
  uploadAttempts: number;
}

export interface SelectedMedia {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}

export interface UploadQueueItem {
  assignmentId: string | null;
  createdAt: string;
  errorMessage: string | null;
  fileName: string;
  fileUri: string;
  id: string;
  mimeType: string;
  /** Colombo's operation identifier, the key for its delivery receipt. */
  operationId: string | null;
  progress: number;
  /** How many consecutive reconciliation attempts have not produced a receipt. */
  reconcileAttempts: number;
  /** Earliest ISO time the next reconciliation may run; `null` when none is due. */
  nextReconcileAt: string | null;
  /** Colombo's bounded failure code, when it reported one. */
  serverFailureCode: ColomboFailureCode | null;
  /** The last state a receipt reported. `null` means never reconciled. */
  serverState: ServerState | null;
  /** When the server state above was learned. */
  serverStateAt: string | null;
  source: MediaSource;
  status: UploadStatus;
  updatedAt: string;
}

/** One durable write of what a reconciliation learned. */
export interface ServerStateUpdate {
  failureCode: ColomboFailureCode | null;
  nextReconcileAt: string | null;
  reconcileAttempts: number;
  serverState: ServerState;
  serverStateAt: string;
}

export interface NewUploadQueueItem {
  createdAt: string;
  fileName: string;
  fileUri: string;
  id: string;
  mimeType: string;
  source: MediaSource;
}

export interface UploadQueueStore {
  /** Deletes exactly the rows named. Retention decisions are made by the caller. */
  remove(ids: readonly string[]): Promise<void>;
  initialize(): Promise<void>;
  insert(item: NewUploadQueueItem): Promise<void>;
  list(): Promise<UploadQueueItem[]>;
  markAccepted(id: string, assignmentId: string, operationId: string): Promise<void>;
  recordServerState(id: string, update: ServerStateUpdate): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
  markUploading(id: string): Promise<void>;
  reconcileInterrupted(): Promise<number>;
  retry(id: string): Promise<void>;
  retryAll(): Promise<void>;
  updateProgress(id: string, progress: number): Promise<void>;
}

export interface DurableMediaStore {
  persist(item: SelectedMedia, id: string): Promise<{ fileName: string; fileUri: string; mimeType: string }>;
  reconcile(referencedFileUris: readonly string[]): Promise<number>;
  remove(fileUri: string): Promise<void>;
}

export interface ColomboCredentials {
  baseUrl: string;
  password: string;
  username: string;
}

export interface CredentialsStore {
  load(): Promise<ColomboCredentials | null>;
  save(credentials: ColomboCredentials): Promise<void>;
}

export interface AcceptedUpload {
  assignmentId: string;
  /** Colombo's operation id, required to poll the delivery receipt later. */
  operationId: string;
  status: 'accepted';
}

/**
 * The outcome of one receipt request. Every branch other than `receipt` and
 * `expired` leaves the row's delivery unknown and retryable — a status failure
 * must never be read as delivery or as a terminal failure.
 */
export type ReceiptOutcome =
  | { kind: 'receipt'; receipt: ColomboReceipt }
  | { kind: 'expired'; receipt: ColomboReceipt }
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'malformed' };

export interface ColomboReceipts {
  fetchReceipt(operationId: string, credentials: ColomboCredentials): Promise<ReceiptOutcome>;
}

export interface ColomboUploader {
  upload(
    item: UploadQueueItem,
    credentials: ColomboCredentials,
    onProgress: (progress: number) => void,
  ): Promise<AcceptedUpload>;
}
