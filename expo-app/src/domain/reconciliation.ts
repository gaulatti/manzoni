import type {
  ColomboUploadState,
  ReceiptOutcome,
  ServerState,
  ServerStateUpdate,
  UploadQueueItem,
} from './uploadQueue';

/**
 * Advancing an accepted upload to delivered.
 *
 * Colombo returns `202 Accepted` once a file and its operation context are in a
 * restart-safe spool. Delivery to S3 and the CMS callback happen afterwards and
 * are retried independently, so **acceptance is a promise to deliver, not a
 * completed delivery**. The only way this device learns the real outcome is by
 * polling `GET /uploads/{operationId}`.
 *
 * Two rules follow, and both are enforced here rather than in the UI:
 *
 * 1. **No local timer may infer delivery.** A row advances only on a receipt.
 * 2. **A status failure is not an answer.** A missing, unauthorized, or
 *    unavailable receipt leaves the row `unknown` and retryable — never
 *    `failed`, never `delivered`.
 *
 * Everything here is pure; `now` is injected.
 */

/** Server states that will not change again. */
const TERMINAL_SERVER_STATES: readonly ColomboUploadState[] = [
  'callback-confirmed',
  'failed',
  'expired',
];

/** Server states that mean Colombo is still working on delivery. */
const IN_FLIGHT_SERVER_STATES: readonly ColomboUploadState[] = [
  'accepted',
  'uploading',
  'delivered',
];

/** How often a row still in flight is polled, before backoff. */
export const RECONCILE_INTERVAL_MS = 30_000;
/** The ceiling for repeated unanswered attempts. */
export const RECONCILE_MAX_BACKOFF_MS = 15 * 60_000;

export function isTerminalServerState(state: ServerState | null): boolean {
  return state !== null && (TERMINAL_SERVER_STATES as readonly string[]).includes(state);
}

export function isInFlightServerState(state: ServerState | null): boolean {
  return state !== null && (IN_FLIGHT_SERVER_STATES as readonly string[]).includes(state);
}

/**
 * Exponential backoff for attempts that did not produce a receipt. Bounded, so
 * a long outage does not push the next attempt past the end of a shift.
 */
export function reconcileBackoffMs(attempts: number): number {
  if (attempts <= 0) return RECONCILE_INTERVAL_MS;
  const grown = RECONCILE_INTERVAL_MS * 2 ** Math.min(attempts, 6);
  return Math.min(grown, RECONCILE_MAX_BACKOFF_MS);
}

/**
 * Whether a row should be polled now: it has an operation id, its server state
 * is not terminal, and any backoff has elapsed.
 */
export function needsReconciliation(item: UploadQueueItem, now: Date): boolean {
  if (!item.operationId) return false;
  if (isTerminalServerState(item.serverState)) return false;
  if (!item.nextReconcileAt) return true;
  const due = Date.parse(item.nextReconcileAt);
  return Number.isNaN(due) || due <= now.getTime();
}

/** The rows to poll on one reconciliation pass, oldest first. */
export function reconcilableItems(items: readonly UploadQueueItem[], now: Date): UploadQueueItem[] {
  return items
    .filter((item) => needsReconciliation(item, now))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * Turns one receipt outcome into the durable update to write.
 *
 * A receipt is believed exactly as given. Everything else records `unknown`
 * with a longer backoff and leaves the previous knowledge — including a
 * previously observed terminal state — untouched.
 */
export function applyReceiptOutcome(
  item: UploadQueueItem,
  outcome: ReceiptOutcome,
  now: Date,
): ServerStateUpdate {
  const at = now.toISOString();

  if (outcome.kind === 'receipt' || outcome.kind === 'expired') {
    const state = outcome.receipt.state;
    const terminal = isTerminalServerState(state);
    return {
      failureCode: outcome.receipt.failureCode,
      // A terminal state is never polled again.
      nextReconcileAt: terminal ? null : new Date(now.getTime() + RECONCILE_INTERVAL_MS).toISOString(),
      reconcileAttempts: 0,
      serverState: state,
      serverStateAt: at,
    };
  }

  const attempts = item.reconcileAttempts + 1;
  return {
    failureCode: item.serverFailureCode,
    nextReconcileAt: new Date(now.getTime() + reconcileBackoffMs(attempts)).toISOString(),
    reconcileAttempts: attempts,
    // Explicitly not `failed`: we did not learn that the upload failed, only
    // that we could not find out.
    serverState: 'unknown',
    serverStateAt: at,
  };
}

/**
 * Whether the file may be uploaded again.
 *
 * Re-uploading a row Colombo is still working on would duplicate the delivery,
 * so a transient status failure must never open that door. A new upload is only
 * safe when the server never received this file, or when it reported a terminal
 * failure or expiry — both of which make a fresh operation the documented
 * recovery.
 */
export function canRetryUpload(item: UploadQueueItem): boolean {
  if (!item.operationId) return item.status === 'failed' || item.status === 'pending';
  return item.serverState === 'failed' || item.serverState === 'expired';
}

/**
 * Whether the local copy and row may be removed. Retention is only ever applied
 * to a row the server has finished with; an unknown or in-flight row is kept.
 */
export function isDeletable(item: UploadQueueItem): boolean {
  return isTerminalServerState(item.serverState);
}

/**
 * The single state one row presents. Local progress wins while this device is
 * still working; once Colombo owns the file, its receipt does.
 */
export type PresentationState =
  | 'pending'
  | 'uploading'
  | 'accepted'
  | 'delivered'
  | 'callback-confirmed'
  | 'failed'
  | 'expired'
  | 'unknown';

export function presentationState(item: UploadQueueItem): PresentationState {
  if (item.status === 'pending') return 'pending';
  if (item.status === 'uploading') return 'uploading';
  if (item.status === 'failed') return 'failed';

  // Locally accepted. What the server says decides, and silence does not.
  switch (item.serverState) {
    case 'delivered':
      return 'delivered';
    case 'callback-confirmed':
      return 'callback-confirmed';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'unknown':
      return 'unknown';
    case 'accepted':
    case 'uploading':
    case null:
    case undefined:
    default:
      // Never `delivered`: an accepted upload with no confirming receipt is
      // exactly that, accepted.
      return 'accepted';
  }
}
