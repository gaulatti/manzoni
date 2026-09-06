import { Button } from '@gaulatti/thompson/components/button';
import { Card } from '@gaulatti/thompson/components/card';
import { Alert, Empty } from '@gaulatti/thompson/components/feedback';
import { Stack } from '@gaulatti/thompson/components/layout';
import { Progress } from '@gaulatti/thompson/components/progress';
import { StatusBadge, type StatusBadgeVariant } from '@gaulatti/thompson/components/status-badge';
import { Heading, Text } from '@gaulatti/thompson/components/typography';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import type { UploadQueueItem, UploadStatus } from '../domain/uploadQueue';
import { useUploadQueue } from '../hooks/useUploadQueue';
import type { UploadQueueController } from '../services/uploadQueueController';

const STATUS_PRESENTATION: Record<UploadStatus, { label: string; variant: StatusBadgeVariant }> = {
  accepted: { label: 'Accepted by Colombo', variant: 'live' },
  failed: { label: 'Failed', variant: 'offline' },
  pending: { label: 'Pending', variant: 'warning' },
  uploading: { label: 'Uploading', variant: 'info' },
};

function QueueCard({ controller, item }: { controller: UploadQueueController; item: UploadQueueItem }) {
  const presentation = STATUS_PRESENTATION[item.status];
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
          {item.status === 'uploading' ? <Progress showLabel value={item.progress} /> : null}
          {item.status === 'accepted' ? (
            <Text family="secondary" size="xs" tone="secondary">
              Assignment {item.assignmentId}. Colombo accepted the upload; final delivery is not yet known.
            </Text>
          ) : null}
          {item.status === 'failed' ? (
            <Stack gap="detail">
              <Text family="secondary" size="xs" tone="danger">{item.errorMessage}</Text>
              <Button onPress={() => void controller.retry(item.id)} size="sm" variant="outline">Retry</Button>
            </Stack>
          ) : null}
        </Stack>
      </View>
    </Card>
  );
}

export function QueueScreen({ controller }: { controller: UploadQueueController }) {
  const snapshot = useUploadQueue(controller);
  const failedCount = snapshot.items.filter((item) => item.status === 'failed').length;
  const acceptedCount = snapshot.items.filter((item) => item.status === 'accepted').length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack gap="component">
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Heading level={2}>Upload queue</Heading>
            <Text size="sm" tone="secondary">SQLite-backed state and app-owned media copies survive relaunch.</Text>
          </View>
          {snapshot.isProcessing ? <StatusBadge label="Processing" variant="info" /> : null}
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

        {(failedCount > 0 || acceptedCount > 0) ? (
          <View style={styles.actions}>
            {failedCount > 0 ? <Button onPress={() => void controller.retryAll()} size="sm" variant="outline">Retry failed ({failedCount})</Button> : null}
            {acceptedCount > 0 ? <Button onPress={() => void controller.clearAccepted()} size="sm" variant="ghost">Clear accepted ({acceptedCount})</Button> : null}
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
