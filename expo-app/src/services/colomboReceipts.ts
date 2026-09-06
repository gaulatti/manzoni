import type {
  ColomboCredentials,
  ColomboFailureCode,
  ColomboReceipt,
  ColomboReceipts,
  ColomboUploadState,
  ReceiptOutcome,
} from '../domain/uploadQueue';

/**
 * Colombo's delivery-receipt contract: `GET /uploads/{operationId}` with the
 * same `X-Colombo-*` credentials the upload used.
 *
 * The wire vocabulary is fixed by Colombo and mirrored exactly here: states are
 * kebab-case, failure codes are snake_case. An unrecognised value is treated as
 * a malformed receipt rather than coerced into a state this app understands —
 * guessing here would mean telling a photographer their photo was delivered.
 */

const UPLOAD_STATES: readonly ColomboUploadState[] = [
  'accepted',
  'uploading',
  'delivered',
  'callback-confirmed',
  'failed',
  'expired',
];

const FAILURE_CODES: readonly ColomboFailureCode[] = [
  'corrupt_content',
  'dependency_denied',
  'invalid_metadata',
  'retry_exhausted',
  'tenant_missing',
];

export interface ColomboReceiptRequest {
  headers: Record<string, string>;
  url: string;
}

export function buildReceiptRequest(
  credentials: ColomboCredentials,
  operationId: string,
): ColomboReceiptRequest {
  const baseUrl = credentials.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('Colombo base URL is required.');
  }
  if (!operationId.trim()) {
    throw new Error('An operation id is required to read a delivery receipt.');
  }

  return {
    headers: {
      'X-Colombo-Password': credentials.password,
      'X-Colombo-Username': credentials.username,
    },
    url: `${baseUrl}/uploads/${encodeURIComponent(operationId.trim())}`,
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toReceipt(body: string): ColomboReceipt | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  const state = record.state;
  const operationId = record.operation_id;
  const assignmentId = record.assignment_id;

  if (typeof state !== 'string' || !(UPLOAD_STATES as readonly string[]).includes(state)) return null;
  if (typeof operationId !== 'string' || operationId.trim() === '') return null;
  if (typeof assignmentId !== 'string' && typeof assignmentId !== 'number') return null;

  const failureCode = record.failure_code;
  const knownFailureCode =
    typeof failureCode === 'string' && (FAILURE_CODES as readonly string[]).includes(failureCode)
      ? (failureCode as ColomboFailureCode)
      : null;

  return {
    assignmentId: String(assignmentId),
    callbackAttempts: typeof record.callback_attempts === 'number' ? record.callback_attempts : 0,
    expiresAt: optionalString(record.expires_at),
    failureCode: knownFailureCode,
    operationId,
    state: state as ColomboUploadState,
    updatedAt: optionalString(record.updated_at) ?? '',
    uploadAttempts: typeof record.upload_attempts === 'number' ? record.upload_attempts : 0,
  };
}

/**
 * Maps one HTTP response onto a bounded outcome.
 *
 * `410 Gone` carries the receipt for an expired operation, so it is read rather
 * than discarded. Everything that is not a receipt leaves delivery unknown.
 */
export function parseReceiptResponse(statusCode: number, body: string): ReceiptOutcome {
  if (statusCode === 200) {
    const receipt = toReceipt(body);
    return receipt ? { kind: 'receipt', receipt } : { kind: 'malformed' };
  }
  if (statusCode === 410) {
    const receipt = toReceipt(body);
    return receipt ? { kind: 'expired', receipt } : { kind: 'malformed' };
  }
  if (statusCode === 404) return { kind: 'not-found' };
  if (statusCode === 401 || statusCode === 400) return { kind: 'unauthorized' };
  return { kind: 'unavailable' };
}

/** Reads delivery receipts over `fetch`. A network failure is `unavailable`, not a failure of the upload. */
export class HttpColomboReceipts implements ColomboReceipts {
  constructor(private readonly request: typeof fetch = fetch) {}

  async fetchReceipt(operationId: string, credentials: ColomboCredentials): Promise<ReceiptOutcome> {
    let built: ColomboReceiptRequest;
    try {
      built = buildReceiptRequest(credentials, operationId);
    } catch {
      return { kind: 'malformed' };
    }

    try {
      const response = await this.request(built.url, { headers: built.headers, method: 'GET' });
      const body = await response.text();
      return parseReceiptResponse(response.status, body);
    } catch {
      return { kind: 'unavailable' };
    }
  }
}
