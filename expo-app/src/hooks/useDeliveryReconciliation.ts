import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { UploadQueueController } from '../services/uploadQueueController';

/** How often a foregrounded app re-asks Colombo about rows it is still delivering. */
export const RECONCILE_POLL_MS = 30_000;

interface AppStateEvents {
  readonly currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

interface ConnectivityState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

interface ConnectivityEvents {
  addEventListener(listener: (state: ConnectivityState) => void): () => void;
}

function connectionStatus(state: ConnectivityState): boolean | null {
  if (state.isConnected === false || state.isInternetReachable === false) return false;
  if (state.isConnected === true) return true;
  return null;
}

/**
 * Installs the concrete foreground, network-restoration, and bounded-poll
 * triggers. Dependencies are injectable so the native subscription boundary
 * can be verified without replacing the controller or its receipt rules.
 */
export function subscribeDeliveryReconciliation(
  controller: UploadQueueController,
  appState: AppStateEvents = AppState as AppStateEvents,
  connectivity: ConnectivityEvents = NetInfo as ConnectivityEvents,
): () => void {
  const appStateSubscription = appState.addEventListener('change', (next) => {
    if (next === 'active') void controller.reconcile('foreground');
  });

  let previousConnection: boolean | null = null;
  const unsubscribeConnectivity = connectivity.addEventListener((state) => {
    const nextConnection = connectionStatus(state);
    if (
      previousConnection === false &&
      nextConnection === true &&
      appState.currentState === 'active'
    ) {
      void controller.reconcile('connectivity');
    }
    previousConnection = nextConnection;
  });

  const timer = setInterval(() => {
    if (appState.currentState === 'active') void controller.reconcile('poll');
  }, RECONCILE_POLL_MS);

  return () => {
    appStateSubscription.remove();
    unsubscribeConnectivity();
    clearInterval(timer);
  };
}

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
  useEffect(() => subscribeDeliveryReconciliation(controller), [controller]);
}
