import * as SecureStore from 'expo-secure-store';

import { SecureCredentialsStore } from '../services/credentialsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

describe('SecureCredentialsStore', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('writes one normalized credential payload atomically', async () => {
    setItemAsync.mockResolvedValue();
    const store = new SecureCredentialsStore();

    await store.save({
      baseUrl: 'https://colombo.example.com///',
      password: 'secret-value',
      username: ' operator ',
    });

    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      'colombo_credentials_v1',
      JSON.stringify({
        baseUrl: 'https://colombo.example.com',
        password: 'secret-value',
        username: 'operator',
      }),
    );
  });

  test('loads the single encrypted payload', async () => {
    getItemAsync.mockResolvedValue(JSON.stringify({
      baseUrl: 'https://colombo.example.com',
      password: 'secret-value',
      username: 'operator',
    }));
    const store = new SecureCredentialsStore();

    await expect(store.load()).resolves.toEqual({
      baseUrl: 'https://colombo.example.com',
      password: 'secret-value',
      username: 'operator',
    });
    expect(getItemAsync).toHaveBeenCalledWith('colombo_credentials_v1');
  });

  test('rejects an invalid stored payload without exposing its contents', async () => {
    getItemAsync.mockResolvedValue('{not-json');
    const store = new SecureCredentialsStore();

    await expect(store.load()).rejects.toThrow('Stored Colombo credentials are invalid.');
  });
});
