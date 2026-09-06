import {
  applyReceiptOutcome,
  canRetryUpload,
  isDeletable,
  isTerminalServerState,
  needsReconciliation,
  presentationState,
  reconcilableItems,
  reconcileBackoffMs,
  RECONCILE_INTERVAL_MS,
  RECONCILE_MAX_BACKOFF_MS,
} from '../domain/reconciliation';
import type {
  ColomboReceipt,
  ColomboUploadState,
  ReceiptOutcome,
  UploadQueueItem,
} from '../domain/uploadQueue';

const NOW = new Date('2026-09-06T12:00:00.000Z');

function item(overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    assignmentId: 'assignment-7',
    createdAt: '2026-09-06T11:00:00.000Z',
    errorMessage: null,
    fileName: 'photo.jpg',
    fileUri: 'file:///documents/photo.jpg',
    id: 'queue-1',
    mimeType: 'image/jpeg',
    nextReconcileAt: null,
    operationId: 'operation-1',
    progress: 100,
    reconcileAttempts: 0,
    serverFailureCode: null,
    serverState: 'accepted',
    serverStateAt: '2026-09-06T11:00:00.000Z',
    source: 'camera',
    status: 'accepted',
    updatedAt: '2026-09-06T11:00:00.000Z',
    ...overrides,
  };
}

const receipt = (state: ColomboUploadState, overrides: Partial<ColomboReceipt> = {}): ColomboReceipt => ({
  assignmentId: 'assignment-7',
  callbackAttempts: 0,
  expiresAt: null,
  failureCode: null,
  operationId: 'operation-1',
  state,
  updatedAt: '2026-09-06T12:00:00.000Z',
  uploadAttempts: 1,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Every landed server state maps to one presentation state                   */
/* -------------------------------------------------------------------------- */

describe('presentation', () => {
  test.each<[ColomboUploadState | 'unknown' | null, string]>([
    ['accepted', 'accepted'],
    ['uploading', 'accepted'],
    ['delivered', 'delivered'],
    ['callback-confirmed', 'callback-confirmed'],
    ['failed', 'failed'],
    ['expired', 'expired'],
    ['unknown', 'unknown'],
    [null, 'accepted'],
  ])('a locally accepted row with server state %s presents as %s', (serverState, expected) => {
    expect(presentationState(item({ serverState }))).toBe(expected);
  });

  test('accepted never renders as delivered', () => {
    // The whole point of the receipt contract: acceptance is a promise to
    // deliver, so nothing short of a delivered receipt may say delivered.
    for (const serverState of ['accepted', 'uploading', 'unknown', null] as const) {
      expect(presentationState(item({ serverState }))).not.toBe('delivered');
      expect(presentationState(item({ serverState }))).not.toBe('callback-confirmed');
    }
  });

  test('local progress wins while this device is still working', () => {
    expect(presentationState(item({ serverState: null, status: 'pending' }))).toBe('pending');
    expect(presentationState(item({ serverState: null, status: 'uploading' }))).toBe('uploading');
    expect(presentationState(item({ serverState: null, status: 'failed' }))).toBe('failed');
  });
});

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                  */
/* -------------------------------------------------------------------------- */

describe('scheduling', () => {
  test('terminal states are never polled again', () => {
    for (const state of ['callback-confirmed', 'failed', 'expired'] as const) {
      expect(isTerminalServerState(state)).toBe(true);
      expect(needsReconciliation(item({ serverState: state }), NOW)).toBe(false);
    }
    for (const state of ['accepted', 'uploading', 'delivered', 'unknown'] as const) {
      expect(isTerminalServerState(state)).toBe(false);
    }
  });

  test('a row with no operation id is never polled', () => {
    expect(needsReconciliation(item({ operationId: null, serverState: null }), NOW)).toBe(false);
  });

  test('backoff is respected and bounded', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(needsReconciliation(item({ nextReconcileAt: future }), NOW)).toBe(false);
    expect(needsReconciliation(item({ nextReconcileAt: '2026-09-06T11:59:00.000Z' }), NOW)).toBe(true);
    expect(needsReconciliation(item({ nextReconcileAt: 'not-a-date' }), NOW)).toBe(true);

    expect(reconcileBackoffMs(0)).toBe(RECONCILE_INTERVAL_MS);
    expect(reconcileBackoffMs(1)).toBeGreaterThan(RECONCILE_INTERVAL_MS);
    expect(reconcileBackoffMs(3)).toBeGreaterThan(reconcileBackoffMs(2));
    expect(reconcileBackoffMs(50)).toBe(RECONCILE_MAX_BACKOFF_MS);
  });

  test('due rows are polled oldest first', () => {
    const rows = [
      item({ createdAt: '2026-09-06T11:30:00.000Z', id: 'newer' }),
      item({ createdAt: '2026-09-06T10:00:00.000Z', id: 'older' }),
      item({ id: 'terminal', serverState: 'callback-confirmed' }),
    ];

    expect(reconcilableItems(rows, NOW).map((row) => row.id)).toEqual(['older', 'newer']);
  });
});

/* -------------------------------------------------------------------------- */
/* Applying a receipt                                                          */
/* -------------------------------------------------------------------------- */

describe('applyReceiptOutcome', () => {
  test('a receipt is believed exactly as given and resets backoff', () => {
    const update = applyReceiptOutcome(item({ reconcileAttempts: 4 }), { kind: 'receipt', receipt: receipt('delivered') }, NOW);

    expect(update).toMatchObject({ reconcileAttempts: 0, serverState: 'delivered' });
    expect(update.nextReconcileAt).toBe(new Date(NOW.getTime() + RECONCILE_INTERVAL_MS).toISOString());
  });

  test('a terminal receipt stops the polling', () => {
    for (const state of ['callback-confirmed', 'failed', 'expired'] as const) {
      expect(applyReceiptOutcome(item(), { kind: 'receipt', receipt: receipt(state) }, NOW).nextReconcileAt).toBeNull();
    }
  });

  test('a 410 records the expiry it carries', () => {
    const update = applyReceiptOutcome(item(), { kind: 'expired', receipt: receipt('expired') }, NOW);

    expect(update).toMatchObject({ nextReconcileAt: null, serverState: 'expired' });
  });

  test('a failure code is carried through', () => {
    const update = applyReceiptOutcome(
      item(),
      { kind: 'receipt', receipt: receipt('failed', { failureCode: 'retry_exhausted' }) },
      NOW,
    );

    expect(update.failureCode).toBe('retry_exhausted');
  });

  test.each<[ReceiptOutcome['kind']]>([
    ['not-found'],
    ['unauthorized'],
    ['unavailable'],
    ['malformed'],
  ])('a %s answer leaves delivery unknown and retryable, never failed', (kind) => {
    const update = applyReceiptOutcome(item({ reconcileAttempts: 1 }), { kind } as ReceiptOutcome, NOW);

    expect(update.serverState).toBe('unknown');
    expect(update.serverState).not.toBe('failed');
    expect(update.reconcileAttempts).toBe(2);
    expect(update.nextReconcileAt).not.toBeNull();
  });

  test('an unanswered attempt keeps the failure code it already knew', () => {
    const update = applyReceiptOutcome(
      item({ serverFailureCode: 'dependency_denied' }),
      { kind: 'unavailable' },
      NOW,
    );

    expect(update.failureCode).toBe('dependency_denied');
  });
});

/* -------------------------------------------------------------------------- */
/* Retry and retention                                                         */
/* -------------------------------------------------------------------------- */

describe('retry rules', () => {
  test('a transient status failure cannot duplicate an upload', () => {
    // Colombo may still be delivering this file; a second upload would be a
    // second delivery.
    for (const serverState of ['accepted', 'uploading', 'delivered', 'callback-confirmed', 'unknown'] as const) {
      expect(canRetryUpload(item({ serverState }))).toBe(false);
    }
  });

  test('a terminal server failure or expiry is the documented recovery', () => {
    expect(canRetryUpload(item({ serverState: 'failed' }))).toBe(true);
    expect(canRetryUpload(item({ serverState: 'expired' }))).toBe(true);
  });

  test('a row the server never received may always be retried', () => {
    expect(canRetryUpload(item({ operationId: null, serverState: null, status: 'failed' }))).toBe(true);
    expect(canRetryUpload(item({ operationId: null, serverState: null, status: 'pending' }))).toBe(true);
    expect(canRetryUpload(item({ operationId: null, serverState: null, status: 'uploading' }))).toBe(false);
  });
});

describe('retention', () => {
  test('only a row the server has finished with may be deleted', () => {
    for (const serverState of ['callback-confirmed', 'failed', 'expired'] as const) {
      expect(isDeletable(item({ serverState }))).toBe(true);
    }
    for (const serverState of ['accepted', 'uploading', 'delivered', 'unknown', null] as const) {
      expect(isDeletable(item({ serverState }))).toBe(false);
    }
  });
});
