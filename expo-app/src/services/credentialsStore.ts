import * as SecureStore from 'expo-secure-store';

import type { ColomboCredentials, CredentialsStore } from '../domain/uploadQueue';

const KEYS = {
  baseUrl: 'colombo_base_url',
  password: 'colombo_password',
  username: 'colombo_username',
} as const;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export class SecureCredentialsStore implements CredentialsStore {
  async load(): Promise<ColomboCredentials | null> {
    const [baseUrl, username, password] = await Promise.all([
      SecureStore.getItemAsync(KEYS.baseUrl),
      SecureStore.getItemAsync(KEYS.username),
      SecureStore.getItemAsync(KEYS.password),
    ]);

    if (!baseUrl || !username || !password) {
      return null;
    }

    return { baseUrl, password, username };
  }

  async save(credentials: ColomboCredentials): Promise<void> {
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const username = credentials.username.trim();
    if (!baseUrl || !username || !credentials.password) {
      throw new Error('Base URL, username, and password are required.');
    }

    await Promise.all([
      SecureStore.setItemAsync(KEYS.baseUrl, baseUrl),
      SecureStore.setItemAsync(KEYS.username, username),
      SecureStore.setItemAsync(KEYS.password, credentials.password),
    ]);
  }
}
