import { openDatabaseAsync } from 'expo-sqlite';

import { ExpoColomboUploader } from './colomboUploader';
import { SecureCredentialsStore } from './credentialsStore';
import { ExpoDurableMediaStore } from './durableMediaStore';
import { SQLiteUploadQueueStore } from './sqliteUploadQueueStore';
import { UploadQueueController } from './uploadQueueController';

export interface ManzoniRuntime {
  controller: UploadQueueController;
  credentialsStore: SecureCredentialsStore;
}

export async function createManzoniRuntime(): Promise<ManzoniRuntime> {
  const database = await openDatabaseAsync('manzoni-upload-queue.db');
  const credentialsStore = new SecureCredentialsStore();
  const controller = new UploadQueueController(
    new SQLiteUploadQueueStore(database),
    new ExpoDurableMediaStore(),
    credentialsStore,
    new ExpoColomboUploader(),
  );
  await controller.initialize();
  return { controller, credentialsStore };
}
