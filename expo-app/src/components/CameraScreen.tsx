import Slider from '@react-native-community/slider';
import { Button } from '@gaulatti/thompson/components/button';
import { Card } from '@gaulatti/thompson/components/card';
import { Empty, ErrorState, LoadingSpinner } from '@gaulatti/thompson/components/feedback';
import { Stack } from '@gaulatti/thompson/components/layout';
import { StatusBadge } from '@gaulatti/thompson/components/status-badge';
import { Heading, Text } from '@gaulatti/thompson/components/typography';
import { CameraView, useCameraPermissions, type CameraType, type FocusMode } from 'expo-camera';
import * as Device from 'expo-device';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import type { UploadQueueController } from '../services/uploadQueueController';
import { enqueueSelectedMedia } from '../services/uploadQueueController';

interface CameraScreenProps {
  controller: UploadQueueController;
  onOpenLibrary(): void;
}

type Availability = 'checking' | 'available' | 'unavailable';

export function CameraScreen({ controller, onOpenLibrary }: CameraScreenProps) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [availability, setAvailability] = useState<Availability>('checking');
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [focus, setFocus] = useState<FocusMode>('off');
  const [lenses, setLenses] = useState<string[]>([]);
  const [selectedLens, setSelectedLens] = useState<string | undefined>();
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!Device.isDevice) {
      setAvailability('unavailable');
    } else {
      void CameraView.isAvailableAsync()
        .then((available) => mounted && setAvailability(available ? 'available' : 'unavailable'))
        .catch(() => mounted && setAvailability(Platform.OS === 'web' ? 'unavailable' : 'available'));
    }
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const capture = useCallback(async () => {
    if (!camera.current || !cameraReady || !appIsActive || capturing) return;
    setCapturing(true);
    setCameraError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      await enqueueSelectedMedia(controller, 'camera', [
        {
          fileName: `camera-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          uri: photo.uri,
        },
      ]);
    } catch {
      setCameraError('The photo could not be captured and queued.');
    } finally {
      setCapturing(false);
    }
  }, [appIsActive, cameraReady, capturing, controller]);

  if (availability === 'checking' || permission === null) {
    return <LoadingSpinner label="Checking camera availability…" size="lg" style={styles.center} />;
  }

  if (availability === 'unavailable') {
    return (
      <Empty
        action={<Button onPress={onOpenLibrary}>Choose from library</Button>}
        description="This simulator or device does not expose a camera. Library uploads remain available."
        title="No camera available"
        style={styles.state}
      />
    );
  }

  if (!permission.granted) {
    return (
      <Empty
        action={<Button onPress={() => void requestPermission()}>Allow camera access</Button>}
        description="Manzoni uses the camera only to create an app-owned photo copy for the durable queue."
        title="Camera access required"
        style={styles.state}
      />
    );
  }

  if (cameraError) {
    return (
      <ErrorState
        action={
          <Stack horizontal>
            <Button onPress={() => setCameraError(null)}>Try camera again</Button>
            <Button onPress={onOpenLibrary} variant="outline">Use library</Button>
          </Stack>
        }
        description={cameraError}
        title="Camera unavailable"
        style={styles.state}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View>
          <Heading level={2}>Capture</Heading>
          <Text tone="secondary" size="sm">Photos enter the same durable queue as library selections.</Text>
        </View>
        <StatusBadge
          label={appIsActive ? (cameraReady ? 'Camera ready' : 'Starting camera') : 'Camera paused'}
          variant={appIsActive && cameraReady ? 'live' : 'warning'}
        />
      </View>

      <CameraView
        active={appIsActive}
        autofocus={focus}
        facing={facing}
        mode="picture"
        onAvailableLensesChanged={({ lenses: availableLenses }) => {
          setLenses(availableLenses);
          setSelectedLens((current) => (
            current && availableLenses.includes(current) ? current : availableLenses[0]
          ));
        }}
        onCameraReady={() => setCameraReady(true)}
        onMountError={({ message }) => setCameraError(message || 'The camera preview could not start.')}
        ref={camera}
        selectedLens={selectedLens}
        style={styles.preview}
        zoom={zoom}
      />

      <Card padding="sm" style={styles.controls}>
        <Stack gap="control">
          <View style={styles.controlRow}>
            <Button onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))} size="sm" variant="secondary">
              Lens: {facing === 'back' ? 'rear' : 'front'}
            </Button>
            <Button onPress={() => setFocus((value) => (value === 'off' ? 'on' : 'off'))} size="sm" variant="secondary">
              Focus: {focus === 'off' ? 'continuous' : 'locked'}
            </Button>
          </View>
          {lenses.length > 1 ? (
            <View style={styles.controlRow}>
              {lenses.map((lens) => (
                <Button
                  key={lens}
                  onPress={() => setSelectedLens(lens)}
                  size="xs"
                  variant={lens === selectedLens ? 'primary' : 'ghost'}
                >
                  {lens.replace(/^builtIn|Camera$/g, '').replace(/([A-Z])/g, ' $1').trim()}
                </Button>
              ))}
            </View>
          ) : null}
          <View style={styles.zoomRow}>
            <Text size="sm" weight="600">Zoom</Text>
            <Slider
              accessibilityLabel="Camera zoom"
              maximumValue={1}
              minimumValue={0}
              onValueChange={setZoom}
              step={0.01}
              style={styles.slider}
              value={zoom}
            />
            <Text size="xs" tone="secondary">{Math.round(zoom * 100)}%</Text>
          </View>
          <Button
            disabled={!cameraReady || !appIsActive}
            fullWidth
            loading={capturing}
            onPress={() => void capture()}
            size="lg"
          >
            Capture and queue
          </Button>
        </Stack>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  container: { flex: 1, gap: 12, padding: 16 },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  controls: { flexShrink: 0 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  preview: { borderRadius: 16, flex: 1, minHeight: 240, overflow: 'hidden' },
  slider: { flex: 1, height: 32 },
  state: { flex: 1, margin: 16 },
  zoomRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
