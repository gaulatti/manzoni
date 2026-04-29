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
  testWidgets('HomeScreen renders title and open camera button',
      (WidgetTester tester) async {
    final store = SettingsStore(storage: _MockSecureStorage());

    await tester.pumpWidget(
      MaterialApp(
        home: HomeScreen(
          cameras: const [],
          store: store,
        ),
      ),
    );

    expect(find.text('Manzoni'), findsOneWidget);
    expect(find.text('Open Camera'), findsOneWidget);
  });
}
