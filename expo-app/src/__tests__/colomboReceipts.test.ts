import {
  buildReceiptRequest,
  HttpColomboReceipts,
  parseReceiptResponse,
} from '../services/colomboReceipts';
import type { ColomboCredentials, ColomboUploadState } from '../domain/uploadQueue';

const credentials: ColomboCredentials = {
  baseUrl: 'https://colombo.example.com/',
  password: 'test-password',
  username: 'test-user',
};

/** A receipt exactly as Colombo serializes it: kebab-case state, snake_case failure code. */
const receiptBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    accepted_at: '2026-09-06T12:00:00.000Z',
    assignment_id: 'assignment-7',
    callback_attempts: 1,
    checksum_sha256: 'a'.repeat(64),
    content_length: 2048,
    operation_id: '5f1d0f8e-0000-4000-8000-000000000001',
    source_protocol: 'http',
    state: 'delivered',
    updated_at: '2026-09-06T12:01:00.000Z',
    upload_attempts: 2,
    ...overrides,
  });

describe('Colombo delivery-receipt contract', () => {
  test('builds the receipt URL and the same credential headers the upload used', () => {
    const request = buildReceiptRequest(credentials, '5f1d0f8e-0000-4000-8000-000000000001');

    expect(request.url).toBe('https://colombo.example.com/uploads/5f1d0f8e-0000-4000-8000-000000000001');
    expect(request.headers).toEqual({
      'X-Colombo-Password': 'test-password',
      'X-Colombo-Username': 'test-user',
    });
  });

  test('refuses to build a request without a base URL or an operation id', () => {
    expect(() => buildReceiptRequest({ ...credentials, baseUrl: '  ' }, 'op-1')).toThrow();
    expect(() => buildReceiptRequest(credentials, '   ')).toThrow();
  });

  test.each<[ColomboUploadState]>([
    ['accepted'],
    ['uploading'],
    ['delivered'],
    ['callback-confirmed'],
    ['failed'],
    ['expired'],
  ])('reads every landed server state: %s', (state) => {
    const outcome = parseReceiptResponse(200, receiptBody({ state }));

    expect(outcome).toEqual({
      kind: 'receipt',
      receipt: expect.objectContaining({ assignmentId: 'assignment-7', state }),
    });
  });

  test('reads the receipt Colombo attaches to a 410 for an expired operation', () => {
    const outcome = parseReceiptResponse(410, receiptBody({ expires_at: '2026-09-05T12:00:00.000Z', state: 'expired' }));

    expect(outcome).toMatchObject({ kind: 'expired', receipt: { expiresAt: '2026-09-05T12:00:00.000Z', state: 'expired' } });
  });

  test('reads the bounded failure vocabulary', () => {
    const outcome = parseReceiptResponse(200, receiptBody({ failure_code: 'retry_exhausted', state: 'failed' }));

    expect(outcome).toMatchObject({ kind: 'receipt', receipt: { failureCode: 'retry_exhausted' } });
  });

  test('a failure code outside the contract is dropped rather than shown', () => {
    const outcome = parseReceiptResponse(200, receiptBody({ failure_code: 'something_new', state: 'failed' }));

    expect(outcome).toMatchObject({ kind: 'receipt', receipt: { failureCode: null } });
  });

  test('a state outside the contract is malformed, never coerced', () => {
    // Guessing here would risk telling a photographer their photo was delivered.
    expect(parseReceiptResponse(200, receiptBody({ state: 'callback_confirmed' }))).toEqual({ kind: 'malformed' });
    expect(parseReceiptResponse(200, receiptBody({ state: 'something-new' }))).toEqual({ kind: 'malformed' });
    expect(parseReceiptResponse(200, '{not json')).toEqual({ kind: 'malformed' });
    expect(parseReceiptResponse(200, 'null')).toEqual({ kind: 'malformed' });
    expect(parseReceiptResponse(200, JSON.stringify({ state: 'delivered' }))).toEqual({ kind: 'malformed' });
  });

  test('maps the rest of the landed status codes onto bounded outcomes', () => {
    expect(parseReceiptResponse(404, '')).toEqual({ kind: 'not-found' });
    expect(parseReceiptResponse(401, '')).toEqual({ kind: 'unauthorized' });
    expect(parseReceiptResponse(400, '')).toEqual({ kind: 'unauthorized' });
    expect(parseReceiptResponse(503, '')).toEqual({ kind: 'unavailable' });
    expect(parseReceiptResponse(500, '')).toEqual({ kind: 'unavailable' });
    expect(parseReceiptResponse(302, '')).toEqual({ kind: 'unavailable' });
  });

  test('a network failure is unavailable, not a failed upload', async () => {
    const receipts = new HttpColomboReceipts(async () => {
      throw new Error('offline');
    });

    await expect(receipts.fetchReceipt('op-1', credentials)).resolves.toEqual({ kind: 'unavailable' });
  });

  test('fetches with the credential headers and parses the response', async () => {
    const request = jest.fn(async () => ({
      status: 200,
      text: async () => receiptBody({ state: 'callback-confirmed' }),
    })) as unknown as typeof fetch;
    const receipts = new HttpColomboReceipts(request);

    await expect(
      receipts.fetchReceipt('5f1d0f8e-0000-4000-8000-000000000001', credentials),
    ).resolves.toMatchObject({ kind: 'receipt', receipt: { state: 'callback-confirmed' } });

    expect(request).toHaveBeenCalledWith(
      'https://colombo.example.com/uploads/5f1d0f8e-0000-4000-8000-000000000001',
      { headers: { 'X-Colombo-Password': 'test-password', 'X-Colombo-Username': 'test-user' }, method: 'GET' },
    );
  });
});
