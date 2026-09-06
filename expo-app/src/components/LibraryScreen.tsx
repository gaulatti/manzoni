import { Button } from '@gaulatti/thompson/components/button';
import { Card } from '@gaulatti/thompson/components/card';
import { Alert } from '@gaulatti/thompson/components/feedback';
import { Stack } from '@gaulatti/thompson/components/layout';
import { Heading, Text } from '@gaulatti/thompson/components/typography';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { SelectedMedia } from '../domain/uploadQueue';
import type { UploadQueueController } from '../services/uploadQueueController';
import { enqueueSelectedMedia } from '../services/uploadQueueController';

function selectedMedia(result: ImagePicker.ImagePickerSuccessResult): SelectedMedia[] {
  return result.assets
    .filter((asset) => asset.type === 'image' || asset.type === null || asset.type === undefined)
    .map((asset) => ({ fileName: asset.fileName, mimeType: asset.mimeType, uri: asset.uri }));
}

function isSuccessfulResult(
  result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null,
): result is ImagePicker.ImagePickerSuccessResult {
  return result !== null && 'canceled' in result && result.canceled === false;
}

interface LibraryScreenProps {
  controller: UploadQueueController;
  onQueued(): void;
}

export function LibraryScreen({ controller, onQueued }: LibraryScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enqueueResult = useCallback(async (result: ImagePicker.ImagePickerSuccessResult) => {
    const media = selectedMedia(result);
    if (media.length === 0) {
      setError('No image was returned by the media picker.');
      return;
    }
    await enqueueSelectedMedia(controller, 'library', media);
    onQueued();
  }, [controller, onQueued]);

  useEffect(() => {
    void ImagePicker.getPendingResultAsync()
      .then(async (pending) => {
        if (isSuccessfulResult(pending)) {
          await enqueueResult(pending);
        }
      })
      .catch(() => setError('The interrupted image selection could not be restored.'));
  }, [enqueueResult]);

  const chooseImages = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        quality: 1,
      });
      if (!result.canceled) await enqueueResult(result);
    } catch {
      setError('The selected images could not be copied into the queue.');
    } finally {
      setBusy(false);
    }
  }, [enqueueResult]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack gap="group">
        <Stack gap="detail">
          <Heading level={2}>Photo library</Heading>
          <Text tone="secondary">
            Choose one or more images. Manzoni copies each image into app-owned storage before recording it in SQLite.
          </Text>
        </Stack>
        {error ? <Alert description={error} onClose={() => setError(null)} title="Library intake failed" variant="error" /> : null}
        <Card padding="lg">
          <Stack gap="component">
            <Heading level={3}>Durable image intake</Heading>
            <Text family="secondary" tone="secondary">
              Videos are excluded. Camera captures and library images follow one upload, failure, and retry workflow.
            </Text>
            <Button fullWidth loading={busy} onPress={() => void chooseImages()} size="lg">
              Choose images
            </Button>
          </Stack>
        </Card>
      </Stack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: 16 } });
