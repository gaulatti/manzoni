import { Button } from '@gaulatti/thompson/components/button';
import { Card } from '@gaulatti/thompson/components/card';
import { Alert } from '@gaulatti/thompson/components/feedback';
import { Field } from '@gaulatti/thompson/components/field';
import { Input } from '@gaulatti/thompson/components/input';
import { Stack } from '@gaulatti/thompson/components/layout';
import { Heading, Text } from '@gaulatti/thompson/components/typography';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { CredentialsStore } from '../domain/uploadQueue';
import type { UploadQueueController } from '../services/uploadQueueController';

interface SettingsScreenProps {
  controller: UploadQueueController;
  credentialsStore: CredentialsStore;
}

export function SettingsScreen({ controller, credentialsStore }: SettingsScreenProps) {
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let mounted = true;
    void credentialsStore.load()
      .then((credentials) => {
        if (!mounted) return;
        if (credentials) {
          setBaseUrl(credentials.baseUrl);
          setUsername(credentials.username);
          setPassword(credentials.password);
        }
        setBusy(false);
      })
      .catch(() => {
        if (!mounted) return;
        setMessage({ text: 'Credentials could not be loaded from secure storage.', type: 'error' });
        setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, [credentialsStore]);

  const save = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await credentialsStore.save({ baseUrl, password, username });
      setMessage({ text: 'Credentials saved securely on this device.', type: 'success' });
      await controller.processPending();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Credentials could not be saved.', type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [baseUrl, controller, credentialsStore, password, username]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack gap="component">
        <Stack gap="detail">
          <Heading level={2}>Colombo settings</Heading>
          <Text tone="secondary">Credentials are held in SecureStore and never written into the SQLite queue.</Text>
        </Stack>
        {message ? <Alert description={message.text} onClose={() => setMessage(null)} title={message.type === 'success' ? 'Saved' : 'Could not save'} variant={message.type} /> : null}
        <Card padding="lg">
          <Stack gap="component">
            <Field label="Base URL" required>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                keyboardType="url"
                onChangeText={setBaseUrl}
                placeholder="https://colombo.example.com"
                value={baseUrl}
              />
            </Field>
            <Field label="Username" required>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onChangeText={setUsername}
                textContentType="username"
                value={username}
              />
            </Field>
            <Field description="Stored only in the platform credential vault." label="Password or key" required>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                value={password}
              />
            </Field>
            <Button disabled={busy} fullWidth loading={busy} onPress={() => void save()} size="lg">Save settings</Button>
          </Stack>
        </Card>
      </Stack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { padding: 16 } });
