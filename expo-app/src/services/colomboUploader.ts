import { File, UploadType, type UploadOptions } from 'expo-file-system';

import type {
  AcceptedUpload,
  ColomboCredentials,
  ColomboUploader,
  UploadQueueItem,
} from '../domain/uploadQueue';

export interface ColomboUploadRequest {
  options: UploadOptions;
  url: string;
}

export function buildColomboUploadRequest(
  credentials: ColomboCredentials,
  mimeType: string,
  onProgress: (progress: number) => void,
): ColomboUploadRequest {
  const baseUrl = credentials.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Colombo base URL is required.');
  }

  return {
    options: {
      fieldName: 'file',
      headers: {
        'X-Colombo-Password': credentials.password,
        'X-Colombo-Username': credentials.username,
      },
      httpMethod: 'POST',
      mimeType,
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) {
          onProgress((bytesSent / totalBytes) * 100);
        }
      },
      sessionType: 'foreground',
      uploadType: UploadType.MULTIPART,
    },
    url: `${baseUrl}/upload`,
  };
}

export function parseAcceptedUpload(statusCode: number, body: string): AcceptedUpload {
  if (statusCode !== 202) {
    throw new Error(`Colombo rejected the upload with HTTP ${statusCode}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Colombo returned an invalid accepted-upload receipt.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Colombo returned an invalid accepted-upload receipt.');
  }

  const receipt = parsed as Record<string, unknown>;
  const assignmentId = receipt.assignment_id;
  // The operation id is the key to the delivery receipt. Without it this device
  // could never learn whether the file was delivered, so an acceptance that
  // omits it is not usable.
  const operationId = receipt.operation_id;
  if (
    receipt.status !== 'accepted' ||
    (typeof assignmentId !== 'string' && typeof assignmentId !== 'number') ||
    String(assignmentId).trim() === '' ||
    typeof operationId !== 'string' ||
    operationId.trim() === ''
  ) {
    throw new Error('Colombo returned an invalid accepted-upload receipt.');
  }

  return { assignmentId: String(assignmentId), operationId, status: 'accepted' };
}

export class ExpoColomboUploader implements ColomboUploader {
  async upload(
    item: UploadQueueItem,
    credentials: ColomboCredentials,
    onProgress: (progress: number) => void,
  ): Promise<AcceptedUpload> {
    const file = new File(item.fileUri);
    if (!file.exists) {
      throw new Error('The queued media copy is no longer available.');
    }

    const request = buildColomboUploadRequest(credentials, item.mimeType, onProgress);
    const task = file.createUploadTask(request.url, request.options);
    try {
      const response = await task.uploadAsync();
      return parseAcceptedUpload(response.status, response.body);
    } finally {
      task.release();
    }
  }
}
