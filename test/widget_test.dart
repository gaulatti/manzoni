// Smoke test: verify the home screen renders without crashing.
//
// Full widget tests for camera preview would require mocked platform plugins
// and are kept in the unit test files instead.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:manzoni/main.dart';
import 'package:manzoni/src/services/settings_store.dart';

class _MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  testWidgets('HomeScreen renders Radar-style shell and camera tab', (
    WidgetTester tester,
  ) async {
    final storage = _MockSecureStorage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    final store = SettingsStore(storage: storage);
    await store.load();
    clearInteractions(storage);

    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(cameras: const [], store: store),
      ),
    );

    expect(find.text('manzoni'), findsOneWidget);
    expect(find.text('Camera'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('No camera available'), findsOneWidget);
    verifyNever(() => storage.read(key: any(named: 'key')));
  });
}
