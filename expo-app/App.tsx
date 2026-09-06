import { EncodeSans_400Regular } from '@expo-google-fonts/encode-sans/400Regular';
import { EncodeSans_500Medium } from '@expo-google-fonts/encode-sans/500Medium';
import { EncodeSans_600SemiBold } from '@expo-google-fonts/encode-sans/600SemiBold';
import { EncodeSans_700Bold } from '@expo-google-fonts/encode-sans/700Bold';
import { LibreFranklin_400Regular } from '@expo-google-fonts/libre-franklin/400Regular';
import { LibreFranklin_500Medium } from '@expo-google-fonts/libre-franklin/500Medium';
import { BrandLockup } from '@gaulatti/thompson/components/brand-lockup';
import { ErrorState, LoadingSpinner } from '@gaulatti/thompson/components/feedback';
import { Text } from '@gaulatti/thompson/components/typography';
import { Logo } from '@gaulatti/thompson/assets/logo';
import { AppShell, type AppShellTab } from '@gaulatti/thompson/layout/app-shell';
import { ThompsonProvider } from '@gaulatti/thompson/theme';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CameraScreen } from './src/components/CameraScreen';
import { LibraryScreen } from './src/components/LibraryScreen';
import { QueueScreen } from './src/components/QueueScreen';
import { SettingsScreen } from './src/components/SettingsScreen';
import { useDeliveryReconciliation } from './src/hooks/useDeliveryReconciliation';
import { createManzoniRuntime, type ManzoniRuntime } from './src/services/runtime';

type TabId = 'camera' | 'library' | 'queue' | 'settings';

const TABS: AppShellTab[] = [
  { id: 'camera', label: 'Camera', icon: <Text size="lg">◉</Text> },
  { id: 'library', label: 'Library', icon: <Text size="lg">▧</Text> },
  { id: 'queue', label: 'Queue', icon: <Text size="lg">↥</Text> },
  { id: 'settings', label: 'Settings', icon: <Text size="lg">⚙</Text> },
];

function ManzoniApp({ runtime }: { runtime: ManzoniRuntime }) {
  const [activeTab, setActiveTab] = useState<TabId>('camera');
  useDeliveryReconciliation(runtime.controller);
  const screen = useMemo(() => {
    switch (activeTab) {
      case 'camera':
        return <CameraScreen controller={runtime.controller} onOpenLibrary={() => setActiveTab('library')} />;
      case 'library':
        return <LibraryScreen controller={runtime.controller} onQueued={() => setActiveTab('queue')} />;
      case 'queue':
        return <QueueScreen controller={runtime.controller} />;
      case 'settings':
        return <SettingsScreen controller={runtime.controller} credentialsStore={runtime.credentialsStore} />;
    }
  }, [activeTab, runtime]);

  return (
    <AppShell
      activeTab={activeTab}
      header={
        <View style={styles.header}>
          <BrandLockup logo={<Logo size={28} />} name="manzoni" />
        </View>
      }
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      tabs={TABS}
    >
      {screen}
    </AppShell>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    EncodeSans_400Regular,
    EncodeSans_500Medium,
    EncodeSans_600SemiBold,
    EncodeSans_700Bold,
    LibreFranklin_400Regular,
    LibreFranklin_500Medium,
  });
  const [runtime, setRuntime] = useState<ManzoniRuntime | null>(null);
  const [startupError, setStartupError] = useState(false);

  useEffect(() => {
    let mounted = true;
    void createManzoniRuntime()
      .then((created) => mounted && setRuntime(created))
      .catch(() => mounted && setStartupError(true));
    return () => {
      mounted = false;
    };
  }, []);

  if (!fontsLoaded) {
    return <View style={styles.loading} />;
  }

  return (
    <ThompsonProvider defaultTheme="dark">
      <StatusBar style="light" />
      {startupError ? (
        <ErrorState description="The durable upload queue could not be opened." title="Manzoni could not start" style={styles.error} />
      ) : runtime ? (
        <ManzoniApp runtime={runtime} />
      ) : (
        <LoadingSpinner label="Opening durable queue…" size="lg" style={styles.loading} />
      )}
    </ThompsonProvider>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, margin: 16 },
  header: { paddingHorizontal: 18, paddingVertical: 12 },
  loading: { alignItems: 'center', backgroundColor: '#08141b', flex: 1, justifyContent: 'center' },
});
