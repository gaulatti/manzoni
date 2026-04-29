import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:manzoni/src/services/settings_store.dart';

class _MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late _MockSecureStorage storage;
  late SettingsStore store;

  setUp(() {
    storage = _MockSecureStorage();
    store = SettingsStore(storage: storage);
  });

  group('SettingsStore.save', () {
    setUp(() {
      when(
        () => storage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
    });

    test('writes baseUrl to secure storage', () async {
      await store.save(
        baseUrl: 'https://colombo.example.com',
        username: 'alice',
        password: 's3cr3t',
      );
      verify(
        () => storage.write(
          key: 'colombo_base_url',
          value: 'https://colombo.example.com',
        ),
      ).called(1);
    });

    test('writes username to secure storage', () async {
      await store.save(
        baseUrl: 'https://colombo.example.com',
        username: 'alice',
        password: 's3cr3t',
      );
      verify(
        () => storage.write(key: 'colombo_username', value: 'alice'),
      ).called(1);
    });

    test('writes password to secure storage', () async {
      await store.save(
        baseUrl: 'https://colombo.example.com',
        username: 'alice',
        password: 's3cr3t',
      );
      verify(
        () => storage.write(key: 'colombo_password', value: 's3cr3t'),
      ).called(1);
    });
  });

  group('SettingsStore.load', () {
    test('returns stored values', () async {
      when(
        () => storage.read(key: 'colombo_base_url'),
      ).thenAnswer((_) async => 'https://colombo.example.com');
      when(
        () => storage.read(key: 'colombo_username'),
      ).thenAnswer((_) async => 'alice');
      when(
        () => storage.read(key: 'colombo_password'),
      ).thenAnswer((_) async => 's3cr3t');

      final result = await store.load();

      expect(result['baseUrl'], 'https://colombo.example.com');
      expect(result['username'], 'alice');
      expect(result['password'], 's3cr3t');
    });

    test('returns null for keys not yet stored', () async {
      when(
        () => storage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);

      final result = await store.load();

      expect(result['baseUrl'], isNull);
      expect(result['username'], isNull);
      expect(result['password'], isNull);
    });

    test('uses in-memory cache for repeated loads', () async {
      when(
        () => storage.read(key: 'colombo_base_url'),
      ).thenAnswer((_) async => 'https://colombo.example.com');
      when(
        () => storage.read(key: 'colombo_username'),
      ).thenAnswer((_) async => 'alice');
      when(
        () => storage.read(key: 'colombo_password'),
      ).thenAnswer((_) async => 's3cr3t');

      final first = await store.load();
      final second = await store.load();

      expect(first, second);
      verify(() => storage.read(key: 'colombo_base_url')).called(1);
      verify(() => storage.read(key: 'colombo_username')).called(1);
      verify(() => storage.read(key: 'colombo_password')).called(1);
    });

    test('save updates cache returned by subsequent load', () async {
      when(
        () => storage.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => storage.read(key: any(named: 'key')),
      ).thenAnswer((_) async => null);

      await store.save(
        baseUrl: 'https://new.example.com',
        username: 'bob',
        password: 'topsecret',
      );

      final loaded = await store.load();

      expect(loaded['baseUrl'], 'https://new.example.com');
      expect(loaded['username'], 'bob');
      expect(loaded['password'], 'topsecret');
      verifyNever(() => storage.read(key: any(named: 'key')));
    });

    test('uses provided debug prefs instead of secure storage', () async {
      SharedPreferences.setMockInitialValues({
        'colombo_base_url': 'https://debug.example.com',
        'colombo_username': 'debug-user',
        'colombo_password': 'debug-password',
      });
      final prefs = await SharedPreferences.getInstance();
      final debugStore = SettingsStore(
        storage: storage,
        debugPrefs: prefs,
        useDebugPrefs: true,
      );

      final loaded = await debugStore.load();

      expect(loaded['baseUrl'], 'https://debug.example.com');
      expect(loaded['username'], 'debug-user');
      expect(loaded['password'], 'debug-password');
      verifyNever(() => storage.read(key: any(named: 'key')));
    });
  });
}
