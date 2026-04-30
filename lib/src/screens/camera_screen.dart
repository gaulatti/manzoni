import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'review_upload_screen.dart';
import 'settings_screen.dart';
import '../debug_log.dart';
import '../services/settings_store.dart';
import '../theme/manzoni_theme.dart';

/// Screen that shows a live camera preview and allows the user to capture
/// a still image, then forwards to [ReviewUploadScreen].
class CameraScreen extends StatefulWidget {
  const CameraScreen({
    super.key,
    required this.cameras,
    required this.store,
    this.embedded = false,
  });

  final List<CameraDescription> cameras;
  final SettingsStore store;
  final bool embedded;

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  int _cameraIndex = 0;
  int _cameraSession = 0;
  bool _cameraRequested = false;
  bool _initializing = false;
  bool _capturing = false;
  bool _switching = false;
  bool _appActive = true;
  String? _error;

  double _minZoom = 1.0;
  double _maxZoom = 1.0;
  double _currentZoom = 1.0;
  double _baseZoom = 1.0;

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    logDebug('CameraScreen: initState with ${widget.cameras.length} camera(s)');
    WidgetsBinding.instance.addObserver(this);
    _cameraRequested = !widget.embedded;
    if (widget.cameras.isEmpty) {
      _error = 'No cameras found on this device.';
    } else if (_cameraRequested) {
      _initCamera(widget.cameras[_cameraIndex]);
    }
  }

  Future<void> _initCamera(CameraDescription desc) async {
    if (_initializing) {
      logDebug('CameraScreen.initCamera: ignored while initializing');
      return;
    }
    final session = ++_cameraSession;
    setState(() {
      _initializing = true;
      _error = null;
    });
    logDebug(
      'CameraScreen.initCamera[$session]: ${desc.name} ${desc.lensDirection}',
    );

    final previous = _controller;
    _controller = null;
    if (previous != null) {
      await traceDebug(
        'CameraScreen.initCamera[$session].disposePrevious',
        previous.dispose,
      );
    }

    final controller = CameraController(
      desc,
      ResolutionPreset.high,
      enableAudio: false,
    );
    _controller = controller;

    try {
      await traceDebug(
        'CameraScreen.initCamera[$session].initialize',
        () => controller.initialize().timeout(const Duration(seconds: 10)),
      );

      if (!mounted || session != _cameraSession) {
        logDebug('CameraScreen.initCamera[$session]: stale after initialize');
        await traceDebug(
          'CameraScreen.initCamera[$session].disposeStale',
          controller.dispose,
        );
        return;
      }
      
      _minZoom = await controller.getMinZoomLevel();
      _maxZoom = await controller.getMaxZoomLevel();
      _currentZoom = _minZoom;
      _baseZoom = _currentZoom;
    } catch (e) {
      logDebug('CameraScreen.initCamera[$session]: caught $e');
      await traceDebug(
        'CameraScreen.initCamera[$session].disposeAfterError',
        controller.dispose,
      );
      if (_controller == controller) {
        _controller = null;
      }
      if (mounted && session == _cameraSession) {
        setState(() {
          _error = e.toString();
          _initializing = false;
        });
      }
      return;
    }

    if (mounted && session == _cameraSession) {
      setState(() => _initializing = false);
    }
  }

  Future<void> _startCamera() async {
    logDebug('CameraScreen.startCamera: pressed');
    if (widget.cameras.isEmpty) return;
    _cameraRequested = true;
    await _initCamera(widget.cameras[_cameraIndex]);
  }

  Future<void> _disposeController() async {
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      await traceDebug('CameraScreen.disposeController', controller.dispose);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    logDebug('CameraScreen.lifecycle: $state');
    _appActive = state == AppLifecycleState.resumed;
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _cameraSession++;
      _disposeController();
    } else if (state == AppLifecycleState.resumed &&
        _cameraRequested &&
        widget.cameras.isNotEmpty) {
      _initCamera(widget.cameras[_cameraIndex]);
    }
  }

  Future<void> _capture() async {
    logDebug('CameraScreen.capture: pressed');
    final controller = _controller;
    if (!_canCapture(controller)) {
      logDebug('CameraScreen.capture: ignored');
      return;
    }
    final activeController = controller!;
    setState(() => _capturing = true);
    try {
      final file = await traceDebug(
        'CameraScreen.capture.takePicture',
        activeController.takePicture,
      );
      if (!mounted) return;
      logDebug('CameraScreen.capture: pushing review for ${file.path}');
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              ReviewUploadScreen(imagePath: file.path, store: widget.store),
        ),
      );
      if (mounted) {
        SystemChrome.setPreferredOrientations(DeviceOrientation.values);
      }
      logDebug('CameraScreen.capture: review returned');
    } catch (e) {
      if (mounted) {
        logDebug('CameraScreen.capture: showing failure: $e');
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Capture failed: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _capturing = false);
        logDebug('CameraScreen.capture: capturing flag cleared');
      }
    }
  }

  Future<void> _switchCamera() async {
    logDebug('CameraScreen.switchCamera: pressed');
    if (widget.cameras.length < 2 || _switching || _initializing) return;
    setState(() => _switching = true);
    _cameraIndex = (_cameraIndex + 1) % widget.cameras.length;
    try {
      await _initCamera(widget.cameras[_cameraIndex]);
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  @override
  void dispose() {
    logDebug('CameraScreen: dispose');
    WidgetsBinding.instance.removeObserver(this);
    _cameraSession++;
    _disposeController();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    logDebug('CameraScreen.build');
    if (widget.embedded) return _buildEmbedded();

    if (widget.cameras.isEmpty) {
      return Scaffold(
        body: AppSurface(
          child: SafeArea(
            child: Column(
              children: [
                ShellHeader(
                  status: 'simulator',
                  leading: IconButton(
                    icon: const Icon(Icons.chevron_left),
                    tooltip: 'Back',
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 560),
                        child: const Panel(
                          padding: EdgeInsets.all(18),
                          child: SectionLabel(
                            icon: Icons.videocam_off_outlined,
                            title: 'No camera available',
                            subtitle:
                                'Run on a physical device to capture a Colombo image.',
                            color: ManzoniColors.desert,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          _buildBody(),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.settings, color: Colors.white),
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => SettingsScreen(store: widget.store),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.only(bottom: 32.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(width: 48), // Spacer to balance the row
                      _buildCaptureButton(),
                      if (widget.cameras.length > 1)
                        IconButton(
                          icon: const Icon(Icons.flip_camera_ios, color: Colors.white, size: 36),
                          onPressed: _switchCamera,
                          tooltip: 'Switch camera',
                        )
                      else
                        const SizedBox(width: 48), // Spacer to balance if no switch button
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmbedded() {
    if (widget.cameras.isEmpty) {
      return Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: const Padding(
            padding: EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Panel(
              padding: EdgeInsets.all(18),
              child: SectionLabel(
                icon: Icons.videocam_off_outlined,
                title: 'No camera available',
                subtitle: 'The simulator does not expose a device camera.',
                color: ManzoniColors.desert,
              ),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Panel(
              padding: const EdgeInsets.all(18),
              child: SectionLabel(
                icon: Icons.camera_alt_outlined,
                title: 'Capture',
                subtitle:
                    '${widget.cameras.length} camera${widget.cameras.length == 1 ? '' : 's'} ready for Colombo upload.',
                color: ManzoniColors.sea,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.1),
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _buildBody(),
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: 16,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 56,
                              child: widget.cameras.length > 1
                                  ? IconButton(
                                      icon: const Icon(
                                        Icons.flip_camera_ios_outlined,
                                      ),
                                      tooltip: 'Switch camera',
                                      onPressed: _switching
                                          ? null
                                          : _switchCamera,
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 22),
                            _buildCaptureButton(),
                            const SizedBox(width: 22),
                            const SizedBox(width: 56),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (!_cameraRequested && widget.embedded) {
      return _CameraStartPanel(onStart: _startCamera);
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
              if (widget.embedded) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _initializing ? null : _startCamera,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Retry Camera'),
                ),
              ],
            ],
          ),
        ),
      );
    }

    final controller = _controller;
    if (_initializing ||
        controller == null ||
        !controller.value.isInitialized) {
      return const Center(child: CircularProgressIndicator());
    }

    return Center(
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                onScaleStart: (details) {
                  _baseZoom = _currentZoom;
                },
                onScaleUpdate: (details) {
                  if (_minZoom == _maxZoom) return;
                  final newZoom =
                      (_baseZoom * details.scale).clamp(_minZoom, _maxZoom);
                  if (newZoom != _currentZoom) {
                    setState(() => _currentZoom = newZoom);
                    controller.setZoomLevel(newZoom);
                  }
                },
                onTapDown: (details) {
                  final double x = details.localPosition.dx / constraints.maxWidth;
                  final double y = details.localPosition.dy / constraints.maxHeight;
                  controller.setFocusPoint(Offset(x, y));
                  // Optionally, we could show a focus indicator here
                },
                child: CameraPreview(controller),
              ),
              if (_maxZoom > _minZoom)
                Positioned(
                  right: 16,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: RotatedBox(
                      quarterTurns: 3,
                      child: SizedBox(
                        width: 200,
                        child: Slider(
                          value: _currentZoom,
                          min: _minZoom,
                          max: _maxZoom,
                          activeColor: Colors.white,
                          inactiveColor: Colors.white30,
                          onChanged: (value) {
                            setState(() => _currentZoom = value);
                            controller.setZoomLevel(value);
                          },
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildCaptureButton() {
    final controller = _controller;
    return FloatingActionButton.large(
      onPressed: _canCapture(controller) ? _capture : null,
      backgroundColor: Colors.white,
      foregroundColor: Colors.black,
      elevation: 0,
      shape: const CircleBorder(),
      child: _capturing
          ? const CircularProgressIndicator(color: Colors.black)
          : const SizedBox(),
    );
  }

  bool _canCapture(CameraController? controller) {
    return controller != null &&
        controller.value.isInitialized &&
        _appActive &&
        !_initializing &&
        !_capturing;
  }
}

class _CameraStartPanel extends StatelessWidget {
  const _CameraStartPanel({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.camera_alt_outlined,
                size: 42,
                color: ManzoniColors.textSecondary.withValues(alpha: 0.9),
              ),
              const SizedBox(height: 14),
              Text(
                'Camera is idle',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Start a capture session when you are ready.',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onStart,
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Start Camera'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
