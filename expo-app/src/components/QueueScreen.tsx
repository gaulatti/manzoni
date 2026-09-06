import { Button } from '@gaulatti/thompson/components/button';
import { Card } from '@gaulatti/thompson/components/card';
import { Alert, Empty } from '@gaulatti/thompson/components/feedback';
import { Stack } from '@gaulatti/thompson/components/layout';
import { Progress } from '@gaulatti/thompson/components/progress';
import { StatusBadge, type StatusBadgeVariant } from '@gaulatti/thompson/components/status-badge';
import { Heading, Text } from '@gaulatti/thompson/components/typography';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { canRetryUpload, isDeletable, presentationState, type PresentationState } from '../domain/reconciliation';
import type { UploadQueueItem } from '../domain/uploadQueue';
import { useUploadQueue } from '../hooks/useUploadQueue';
import type { UploadQueueController } from '../services/uploadQueueController';

/**
 * One label per state Colombo can be in, so acceptance is never dressed up as
 * delivery and an unknown answer is never dressed up as either outcome.
 */
const STATUS_PRESENTATION: Record<PresentationState, { detail: string; label: string; variant: StatusBadgeVariant }> = {
  accepted: {
    detail: 'Colombo accepted the upload and is delivering it. Final delivery is not confirmed yet.',
    label: 'Accepted by Colombo',
    variant: 'info',
  },
  'callback-confirmed': {
    detail: 'Colombo delivered the file and the newsroom confirmed receipt.',
    label: 'Confirmed by the newsroom',
    variant: 'live',
  },
  delivered: {
    detail: 'Colombo delivered the file. Waiting for the newsroom to confirm.',
    label: 'Delivered',
    variant: 'live',
  },
  expired: {
    detail: 'Colombo expired this operation before it was delivered. Upload the photo again.',
    label: 'Expired',
    variant: 'offline',
  },
  failed: { detail: '', label: 'Failed', variant: 'offline' },
  pending: { detail: 'Waiting to upload.', label: 'Pending', variant: 'warning' },
  unknown: {
    detail: 'Colombo could not be reached for this upload. Its delivery is still unknown; it has not failed.',
    label: 'Delivery unknown',
    variant: 'warning',
  },
  uploading: { detail: '', label: 'Uploading', variant: 'info' },
};

const FAILURE_EXPLANATION: Record<string, string> = {
  corrupt_content: 'Colombo could not read the uploaded file.',
  dependency_denied: 'A service Colombo depends on refused the delivery.',
  invalid_metadata: 'Colombo rejected the upload metadata.',
  retry_exhausted: 'Colombo retried delivery until its attempts ran out.',
  tenant_missing: 'The account for this upload is no longer registered.',
};

function QueueCard({ controller, item }: { controller: UploadQueueController; item: UploadQueueItem }) {
  const state = presentationState(item);
  const presentation = STATUS_PRESENTATION[state];
  const retryable = canRetryUpload(item);
  return (
    <Card padding="sm">
      <View style={styles.itemRow}>
        <Image accessibilityLabel={item.fileName} source={{ uri: item.fileUri }} style={styles.thumbnail} />
        <Stack gap="detail" style={styles.itemCopy}>
          <View style={styles.statusRow}>
            <StatusBadge label={presentation.label} variant={presentation.variant} />
            <Text size="xs" tone="secondary">{item.source === 'camera' ? 'Camera' : 'Library'}</Text>
          </View>
          <Text numberOfLines={1} size="sm" weight="600">{item.fileName}</Text>
          {state === 'uploading' ? <Progress showLabel value={item.progress} /> : null}
          {presentation.detail ? (
            <Text family="secondary" size="xs" tone={state === 'expired' ? 'danger' : 'secondary'}>
              {item.assignmentId ? `Assignment ${item.assignmentId}. ` : ''}{presentation.detail}
            </Text>
          ) : null}
          {state === 'failed' ? (
            <Text family="secondary" size="xs" tone="danger">
              {(item.serverFailureCode ? FAILURE_EXPLANATION[item.serverFailureCode] : null) ?? item.errorMessage}
            </Text>
          ) : null}
          {retryable ? (
            <Button onPress={() => void controller.retry(item.id)} size="sm" variant="outline">
              {item.operationId ? 'Upload again' : 'Retry'}
            </Button>
          ) : null}
        </Stack>
      </View>
    </Card>
  );
}

export function QueueScreen({ controller }: { controller: UploadQueueController }) {
  const snapshot = useUploadQueue(controller);
  const retryableCount = snapshot.items.filter(canRetryUpload).length;
  const settledCount = snapshot.items.filter(isDeletable).length;
  const awaitingDelivery = snapshot.items.filter((item) => item.operationId && !isDeletable(item)).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack gap="component">
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Heading level={2}>Upload queue</Heading>
            <Text size="sm" tone="secondary">SQLite-backed state and app-owned media copies survive relaunch.</Text>
          </View>
          {snapshot.isProcessing ? <StatusBadge label="Processing" variant="info" /> : null}
          {snapshot.isReconciling ? <StatusBadge label="Checking delivery" variant="info" /> : null}
        </View>

        {snapshot.interruptedCount > 0 ? (
          <Alert
            description={`${snapshot.interruptedCount} interrupted upload${snapshot.interruptedCount === 1 ? '' : 's'} became retryable.`}
            title="Relaunch recovery"
            variant="warning"
          />
        ) : null}
        {snapshot.activeError ? (
          <Alert description={snapshot.activeError} onClose={() => controller.dismissError()} title="Queue paused" variant="warning" />
        ) : null}

        {(retryableCount > 0 || settledCount > 0 || awaitingDelivery > 0) ? (
          <View style={styles.actions}>
            {awaitingDelivery > 0 ? (
              <Button onPress={() => void controller.reconcile('user')} size="sm" variant="outline">
                Check delivery ({awaitingDelivery})
              </Button>
            ) : null}
            {retryableCount > 0 ? <Button onPress={() => void controller.retryAll()} size="sm" variant="outline">Retry failed ({retryableCount})</Button> : null}
            {settledCount > 0 ? <Button onPress={() => void controller.clearSettled()} size="sm" variant="ghost">Clear settled ({settledCount})</Button> : null}
          </View>
        ) : null}

        {snapshot.items.length === 0 ? (
          <Empty
            description="Capture a photo or choose images from the library to create durable queue entries."
            title="Queue is empty"
          />
        ) : snapshot.items.map((item) => <QueueCard controller={controller} item={item} key={item.id} />)}
      </Stack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { padding: 16 },
  headingCopy: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  itemCopy: { flex: 1 },
  itemRow: { flexDirection: 'row', gap: 12 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  thumbnail: { backgroundColor: '#111827', borderRadius: 10, height: 88, width: 72 },
});
