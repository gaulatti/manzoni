import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'src/screens/camera_screen.dart';
import 'src/debug_log.dart';
import 'src/services/settings_store.dart';
import 'src/services/upload_queue.dart';
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
  final uploadQueue = UploadQueue(store: store);
  logDebug('main: found ${cameras.length} camera(s)');
  logDebug('main: running app');
  runApp(ManzoniApp(cameras: cameras, store: store, uploadQueue: uploadQueue));
}

class ManzoniApp extends StatelessWidget {
  const ManzoniApp({super.key, required this.cameras, required this.store, required this.uploadQueue});

  final List<CameraDescription> cameras;
  final SettingsStore store;
  final UploadQueue uploadQueue;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Manzoni',
      theme: ManzoniTheme.dark,
      home: CameraScreen(cameras: cameras, store: store, uploadQueue: uploadQueue),
    );
  }
}
