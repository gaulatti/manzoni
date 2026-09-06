import { Directory, File, Paths } from 'expo-file-system';

import type { DurableMediaStore, SelectedMedia } from '../domain/uploadQueue';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function safeExtension(item: SelectedMedia): string {
  const fromName = item.fileName?.match(/\.[a-zA-Z0-9]{2,5}$/)?.[0].toLowerCase();
  if (fromName) {
    return fromName;
  }
  return MIME_EXTENSIONS[item.mimeType ?? ''] ?? '.jpg';
}

function normalizedMimeType(item: SelectedMedia, extension: string): string {
  if (item.mimeType?.startsWith('image/')) {
    return item.mimeType;
  }
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.heic') return 'image/heic';
  if (extension === '.heif') return 'image/heif';
  if (extension === '.avif') return 'image/avif';
  return 'image/jpeg';
}

export class ExpoDurableMediaStore implements DurableMediaStore {
  private readonly queueDirectory = new Directory(Paths.document, 'upload-queue');

  async persist(item: SelectedMedia, id: string) {
    this.queueDirectory.create({ idempotent: true, intermediates: true });
    const extension = safeExtension(item);
    const destination = new File(this.queueDirectory, `${id}${extension}`);
    await new File(item.uri).copy(destination);

    return {
      fileName: item.fileName?.trim() || destination.name,
      fileUri: destination.uri,
      mimeType: normalizedMimeType(item, extension),
    };
  }

  async remove(fileUri: string): Promise<void> {
    const file = new File(fileUri);
    if (file.exists) {
      file.delete();
    }
  }
}
