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
  logDebug('main: widgets initialized');
  final camerasFuture = traceDebug('main.availableCameras', availableCameras);
  final storeFuture = traceDebug(
    'main.SettingsStore.create',
    SettingsStore.create,
  );

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
      home: HomeScreen(cameras: cameras, store: store),
    );
  }
}

/// Entry-point shell with Radar-style tab navigation.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.cameras, required this.store});

  final List<CameraDescription> cameras;
  final SettingsStore store;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  int? _refreshingTabIndex;
  DateTime? _lastTapTime;
  int? _lastTapIndex;
  late final List<Widget> _pages;

  @override
  void initState() {
    super.initState();
    _pages = [
      CameraScreen(
        cameras: widget.cameras,
        store: widget.store,
        embedded: true,
      ),
      SettingsScreen(store: widget.store, embedded: true),
    ];
  }

  @override
  Widget build(BuildContext context) {
    logDebug('HomeScreen.build');
    return Scaffold(
      body: AppSurface(
        child: SafeArea(
          child: Column(
            children: [
              ShellHeader(
                status: widget.cameras.isEmpty ? 'simulator' : 'ready',
              ),
              Expanded(
                child: IndexedStack(index: _currentIndex, children: _pages),
              ),
              _HomeNav(
                currentIndex: _currentIndex,
                refreshingIndex: _refreshingTabIndex,
                onTap: _handleNavTap,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleNavTap(int index) {
    final now = DateTime.now();
    final isDoubleTap =
        _lastTapIndex == index &&
        _lastTapTime != null &&
        now.difference(_lastTapTime!).inMilliseconds < 300;

    if (isDoubleTap) {
      if (_currentIndex == index) {
        HapticFeedback.mediumImpact();
        setState(() => _refreshingTabIndex = index);
        Future<void>.delayed(const Duration(milliseconds: 600), () {
          if (mounted) setState(() => _refreshingTabIndex = null);
        });
      }
      _lastTapTime = null;
      return;
    }

    _lastTapTime = now;
    _lastTapIndex = index;
    setState(() => _currentIndex = index);
  }
}

class _HomeNav extends StatelessWidget {
  const _HomeNav({
    required this.currentIndex,
    required this.refreshingIndex,
    required this.onTap,
  });

  final int currentIndex;
  final int? refreshingIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: ManzoniColors.deepSea.withValues(alpha: 0.9),
        border: Border(
          top: BorderSide(color: ManzoniColors.sea.withValues(alpha: 0.2)),
        ),
        boxShadow: [
          BoxShadow(
            color: ManzoniColors.sea.withValues(alpha: 0.1),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 84,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _HomeNavItem(
                icon: Icons.camera_alt_outlined,
                selectedIcon: Icons.camera_alt,
                label: 'Camera',
                selected: currentIndex == 0,
                refreshing: refreshingIndex == 0,
                onTap: () => onTap(0),
              ),
              _HomeNavItem(
                icon: Icons.settings_outlined,
                selectedIcon: Icons.settings,
                label: 'Settings',
                selected: currentIndex == 1,
                refreshing: refreshingIndex == 1,
                onTap: () => onTap(1),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeNavItem extends StatelessWidget {
  const _HomeNavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.refreshing,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final bool refreshing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? ManzoniColors.sea : ManzoniColors.textSecondary;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedScale(
                  scale: refreshing ? 1.18 : 1,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOut,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: selected
                        ? BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                ManzoniColors.sea.withValues(alpha: 0.2),
                                ManzoniColors.amber.withValues(alpha: 0.1),
                              ],
                            ),
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                color: ManzoniColors.sea.withValues(alpha: 0.3),
                                blurRadius: 4,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          )
                        : null,
                    child: Icon(
                      selected ? selectedIcon : icon,
                      color: color,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: color,
                    fontSize: 10,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
