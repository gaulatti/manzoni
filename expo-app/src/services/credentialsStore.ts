import * as SecureStore from 'expo-secure-store';

import type { ColomboCredentials, CredentialsStore } from '../domain/uploadQueue';

const CREDENTIALS_KEY = 'colombo_credentials_v1';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export class SecureCredentialsStore implements CredentialsStore {
  async load(): Promise<ColomboCredentials | null> {
    const stored = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    if (!stored) {
      return null;
    }

    let credentials: Partial<ColomboCredentials>;
    try {
      credentials = JSON.parse(stored) as Partial<ColomboCredentials>;
    } catch {
      throw new Error('Stored Colombo credentials are invalid.');
    }

    if (
      typeof credentials.baseUrl !== 'string' ||
      typeof credentials.username !== 'string' ||
      typeof credentials.password !== 'string' ||
      !credentials.baseUrl ||
      !credentials.username ||
      !credentials.password
    ) {
      throw new Error('Stored Colombo credentials are invalid.');
    }

    return {
      baseUrl: credentials.baseUrl,
      password: credentials.password,
      username: credentials.username,
    };
  }

  async save(credentials: ColomboCredentials): Promise<void> {
    const baseUrl = normalizeBaseUrl(credentials.baseUrl);
    const username = credentials.username.trim();
    if (!baseUrl || !username || !credentials.password) {
      throw new Error('Base URL, username, and password are required.');
    }

    await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify({
      baseUrl,
      password: credentials.password,
      username,
    }));
  }
}
