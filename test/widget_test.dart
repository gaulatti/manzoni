// Smoke test: verify the current application shell renders without crashing.
//
// Full widget tests for camera preview would require mocked platform plugins
// and are kept in the unit test files instead.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:manzoni/main.dart';
import 'package:manzoni/src/services/settings_store.dart';
import 'package:manzoni/src/services/upload_queue.dart';

class _MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  testWidgets('ManzoniApp renders the no-camera rollback state', (
    WidgetTester tester,
  ) async {
    final storage = _MockSecureStorage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    final store = SettingsStore(storage: storage);
    await store.load();
    clearInteractions(storage);

    final uploadQueue = UploadQueue(store: store);
    await tester.pumpWidget(
      ManzoniApp(cameras: const [], store: store, uploadQueue: uploadQueue),
    );

    expect(find.text('manzoni'), findsOneWidget);
    expect(find.text('No camera available'), findsOneWidget);
    expect(find.textContaining('physical device'), findsOneWidget);
    verifyNever(() => storage.read(key: any(named: 'key')));
  });
}
