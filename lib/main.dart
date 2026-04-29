import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import 'src/screens/camera_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/services/settings_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final cameras = await availableCameras();
  runApp(ManzoniApp(cameras: cameras));
}

class ManzoniApp extends StatelessWidget {
  const ManzoniApp({super.key, required this.cameras});

  final List<CameraDescription> cameras;

  @override
  Widget build(BuildContext context) {
    final store = SettingsStore();
    return MaterialApp(
      title: 'Manzoni',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: HomeScreen(cameras: cameras, store: store),
    );
  }
}

/// Entry-point screen with navigation to Camera and Settings.
class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.cameras,
    required this.store,
  });

  final List<CameraDescription> cameras;
  final SettingsStore store;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manzoni'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'Settings',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SettingsScreen(store: store),
              ),
            ),
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.camera_alt, size: 80, color: Colors.deepPurple),
            const SizedBox(height: 24),
            const Text(
              'Tap the button below to open the camera\nand upload a photo to Colombo.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              icon: const Icon(Icons.camera_alt),
              label: const Text('Open Camera'),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      CameraScreen(cameras: cameras, store: store),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
