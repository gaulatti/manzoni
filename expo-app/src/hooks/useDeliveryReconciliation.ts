import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { UploadQueueController } from '../services/uploadQueueController';

/** How often a foregrounded app re-asks Colombo about rows it is still delivering. */
export const RECONCILE_POLL_MS = 30_000;

/**
 * Asks Colombo for delivery receipts while the app is in front of a
 * photographer: on every return to the foreground, and on a slow poll after
 * that so a device that regains coverage catches up without a manual refresh.
 *
 * The poll only *asks*. Delivery is still only ever learned from a receipt, and
 * each row's own backoff decides whether a given tick actually calls out, so a
 * long outage does not turn into a request storm.
 */
export function useDeliveryReconciliation(controller: UploadQueueController): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.reconcile('foreground');
    });

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void controller.reconcile('connectivity');
    }, RECONCILE_POLL_MS);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [controller]);
}
