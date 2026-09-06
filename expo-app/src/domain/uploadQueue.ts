export type MediaSource = 'camera' | 'library';

export type UploadStatus = 'pending' | 'uploading' | 'accepted' | 'failed';

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
  progress: number;
  source: MediaSource;
  status: UploadStatus;
  updatedAt: string;
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
  clearAccepted(): Promise<UploadQueueItem[]>;
  initialize(): Promise<void>;
  insert(item: NewUploadQueueItem): Promise<void>;
  list(): Promise<UploadQueueItem[]>;
  markAccepted(id: string, assignmentId: string): Promise<void>;
  markFailed(id: string, message: string): Promise<void>;
  markUploading(id: string): Promise<void>;
  reconcileInterrupted(): Promise<number>;
  retry(id: string): Promise<void>;
  retryAll(): Promise<void>;
  updateProgress(id: string, progress: number): Promise<void>;
}

export interface DurableMediaStore {
  persist(item: SelectedMedia, id: string): Promise<{ fileName: string; fileUri: string; mimeType: string }>;
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
  status: 'accepted';
}

export interface ColomboUploader {
  upload(
    item: UploadQueueItem,
    credentials: ColomboCredentials,
    onProgress: (progress: number) => void,
  ): Promise<AcceptedUpload>;
}
