import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'src/screens/camera_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/debug_log.dart';
import 'src/services/settings_store.dart';
import 'src/theme/manzoni_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);

  logDebug('main: widgets initialized');
  final camerasFuture = traceDebug('main.availableCameras', availableCameras);
  final storeFuture = traceDebug('main.SettingsStore.create', SettingsStore.create);

  final store = await storeFuture;
  await traceDebug('main.SettingsStore.preload', store.load);
  final cameras = await camerasFuture;
  logDebug('main: found ${cameras.length} camera(s)');
  logDebug('main: running app');
  runApp(ManzoniApp(cameras: cameras, store: store));
}

class ManzoniApp extends StatelessWidget {
  const ManzoniApp({super.key, required this.cameras, required this.store});

  final List<CameraDescription> cameras;
  final SettingsStore store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Manzoni',
      theme: ManzoniTheme.dark,
      home: CameraScreen(cameras: cameras, store: store, embedded: false),
    );
  }
}
