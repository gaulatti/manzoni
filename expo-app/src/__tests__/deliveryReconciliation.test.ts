import {
  RECONCILE_POLL_MS,
  subscribeDeliveryReconciliation,
} from '../hooks/useDeliveryReconciliation';
import type { UploadQueueController } from '../services/uploadQueueController';

function harness(initialAppState: string = 'active') {
  let appStateListener: ((state: string) => void) | undefined;
  let connectivityListener:
    | ((state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void)
    | undefined;
  const removeAppState = jest.fn();
  const unsubscribeConnectivity = jest.fn();
  const reconcile = jest.fn(async () => undefined);
  const appState = {
    currentState: initialAppState,
    addEventListener: jest.fn((_type: 'change', listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: removeAppState };
    }),
  };
  const connectivity = {
    addEventListener: jest.fn((listener: typeof connectivityListener) => {
      connectivityListener = listener;
      return unsubscribeConnectivity;
    }),
  };
  const controller = { reconcile } as unknown as UploadQueueController;
  const stop = subscribeDeliveryReconciliation(controller, appState, connectivity);

  return {
    appState,
    appStateListener: () => appStateListener!,
    connectivityListener: () => connectivityListener!,
    reconcile,
    removeAppState,
    stop,
    unsubscribeConnectivity,
  };
}

describe('delivery reconciliation subscriptions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('asks for receipts when the app returns to the foreground', () => {
    const subscriptions = harness('background');

    subscriptions.appState.currentState = 'active';
    subscriptions.appStateListener()('active');

    expect(subscriptions.reconcile).toHaveBeenCalledWith('foreground');
    subscriptions.stop();
  });

  test('asks exactly once when an offline foreground device regains connectivity', () => {
    const subscriptions = harness();
    const emit = subscriptions.connectivityListener();

    emit({ isConnected: false, isInternetReachable: false });
    emit({ isConnected: true, isInternetReachable: true });
    emit({ isConnected: true, isInternetReachable: true });

    expect(subscriptions.reconcile).toHaveBeenCalledTimes(1);
    expect(subscriptions.reconcile).toHaveBeenCalledWith('connectivity');
    subscriptions.stop();
  });

  test('keeps the bounded poll distinct and only runs it in the foreground', () => {
    const subscriptions = harness();

    jest.advanceTimersByTime(RECONCILE_POLL_MS);
    expect(subscriptions.reconcile).toHaveBeenCalledWith('poll');

    subscriptions.appState.currentState = 'background';
    jest.advanceTimersByTime(RECONCILE_POLL_MS);
    expect(subscriptions.reconcile).toHaveBeenCalledTimes(1);
    subscriptions.stop();
  });

  test('removes every listener and the timer on cleanup', () => {
    const subscriptions = harness();

    subscriptions.stop();
    jest.advanceTimersByTime(RECONCILE_POLL_MS);

    expect(subscriptions.removeAppState).toHaveBeenCalledTimes(1);
    expect(subscriptions.unsubscribeConnectivity).toHaveBeenCalledTimes(1);
    expect(subscriptions.reconcile).not.toHaveBeenCalled();
  });
});
