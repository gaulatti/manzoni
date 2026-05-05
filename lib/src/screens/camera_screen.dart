import 'package:camera/camera.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'settings_screen.dart';
import 'photo_library_screen.dart';
import '../debug_log.dart';
import '../services/colombo_api_client.dart';
import '../services/settings_store.dart';
import '../services/upload_queue.dart';
import '../theme/manzoni_theme.dart';

class _UploadQueueBanner extends StatelessWidget {
  const _UploadQueueBanner({required this.queue});
  final UploadQueue queue;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: queue,
      builder: (context, _) {
        if (!queue.hasTasks) return const SizedBox.shrink();
        final total = queue.tasks.length;
        final success = queue.successCount;
        final failed = queue.failedCount;
        final uploading = queue.isUploading;
        final activeTask = queue.tasks.where((t) => t.status == UploadStatus.uploading).firstOrNull;
        final progress = activeTask?.progress ?? (uploading ? 50 : 100);
        final allComplete = success + failed == total && !uploading;

        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: GestureDetector(
            onTap: allComplete ? queue.clearCompleted : queue.retryFailed,
            child: Material(
              color: failed > 0 ? ManzoniColors.terracotta.withValues(alpha: 0.9) : ManzoniColors.sea.withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    if (uploading)
                      SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          value: progress / 100,
                          color: Colors.white,
                        ),
                      )
                    else if (failed > 0)
                      const Icon(Icons.error, size: 16, color: Colors.white)
                    else
                      const Icon(Icons.check_circle, size: 16, color: Colors.white),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            allComplete
                                ? (failed > 0 ? 'Upload complete ($success/$total succeeded)' : '$total uploaded')
                                : '${success + queue.tasks.where((t) => t.status == UploadStatus.uploading).length}/$total uploading',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          if (failed > 0 && !uploading)
                            Text(
                              'Tap to retry failed',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 11,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (allComplete)
                      GestureDetector(
                        onTap: () => queue.clearCompleted(),
                        child: const Icon(Icons.close, color: Colors.white, size: 20),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Screen that shows a live camera preview and allows the user to capture
/// a still image, then uploads it immediately.
class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key, required this.cameras, required this.store, required this.uploadQueue});

  final List<CameraDescription> cameras;
  final SettingsStore store;
  final UploadQueue uploadQueue;

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  int _cameraIndex = 0;
  int _cameraSession = 0;
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
    if (widget.cameras.isEmpty) {
      _error = 'No cameras found on this device.';
    } else {
      _initCamera(widget.cameras[_cameraIndex]);
    }
  }

  Future<void> _initCamera(CameraDescription desc) async {
    final session = ++_cameraSession;
    setState(() {
      _initializing = true;
      _error = null;
    });
    logDebug('CameraScreen.initCamera[$session]: ${desc.name} ${desc.lensDirection}');

    final previous = _controller;
    _controller = null;
    if (previous != null) {
      await traceDebug('CameraScreen.initCamera[$session].disposePrevious', previous.dispose);
    }

    final controller = CameraController(desc, ResolutionPreset.max, enableAudio: false);
    _controller = controller;

    try {
      await traceDebug('CameraScreen.initCamera[$session].initialize', () => controller.initialize().timeout(const Duration(seconds: 10)));

      if (!mounted || session != _cameraSession) {
        logDebug('CameraScreen.initCamera[$session]: stale after initialize');
        await traceDebug('CameraScreen.initCamera[$session].disposeStale', controller.dispose);
        return;
      }

      _minZoom = await controller.getMinZoomLevel();
      _maxZoom = await controller.getMaxZoomLevel();
      _currentZoom = _minZoom;
      _baseZoom = _currentZoom;
    } catch (e) {
      logDebug('CameraScreen.initCamera[$session]: caught $e');
      await traceDebug('CameraScreen.initCamera[$session].disposeAfterError', controller.dispose);
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
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive || state == AppLifecycleState.hidden) {
      _appActive = false;
      _cameraSession++;
      _initializing = false;
      _disposeController();
    } else if (state == AppLifecycleState.resumed && widget.cameras.isNotEmpty) {
      _appActive = true;
      _initCamera(widget.cameras[_cameraIndex]);
    } else {
      _appActive = state == AppLifecycleState.resumed;
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
      final settings = await traceDebug('CameraScreen.store.load', () => widget.store.load(forceRefresh: true));
      final baseUrl = settings['baseUrl'];
      final username = settings['username'];
      final password = settings['password'];

      if (baseUrl == null || baseUrl.isEmpty || username == null || username.isEmpty || password == null || password.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please configure Base URL, Username and Password in Settings to upload.')));
        }
        return;
      }
      
      final client = ColomboApiClient(baseUrl: baseUrl, username: username, password: password);

      final file = await traceDebug('CameraScreen.capture.takePicture', activeController.takePicture);
      if (!mounted) return;
      
      logDebug('CameraScreen.capture: uploading ${file.path}');
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Uploading picture...'), duration: Duration(days: 1)));
      
      final result = await traceDebug(
        'CameraScreen.client.uploadPhoto',
        () => client.uploadPhoto(filePath: file.path),
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload successful! Assignment ID: ${result.assignmentId}')));
      }
    } on DioException catch (e) {
      if (mounted) {
        logDebug('CameraScreen.capture: DioException ${e.type}');
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: ${_dioErrorMessage(e)}')));
      }
    } catch (e) {
      if (mounted) {
        logDebug('CameraScreen.capture: showing failure: $e');
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Capture failed: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _capturing = false);
        logDebug('CameraScreen.capture: capturing flag cleared');
      }
    }
  }

  String _dioErrorMessage(DioException e) {
    if (e.response != null) {
      return 'Server error ${e.response!.statusCode}: ${e.response!.data ?? e.message}';
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'Request timed out. Check your network connection.';
      case DioExceptionType.connectionError:
        return 'Could not connect to server. Check the Base URL in Settings.';
      default:
        return e.message ?? 'Unknown network error.';
    }
  }

  Future<void> _openPhotoLibrary() async {
    logDebug('CameraScreen.openPhotoLibrary: pressed');
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PhotoLibraryPicker(store: widget.store, queue: widget.uploadQueue),
    );
  }

  String _lensLabel(CameraDescription desc) {
    final name = desc.name.toLowerCase();
    if (name.contains('ultra') || name.contains('wide-angle') && !name.contains('back')) {
      return '0.5';
    }
    if (name.contains('telephoto')) {
      if (name.contains('3') || name.contains('77')) return '3';
      if (name.contains('5') || name.contains('120')) return '5';
      if (name.contains('2') || name.contains('52')) return '2';
      return '3';
    }
    final backCameras = widget.cameras.where((c) => c.lensDirection == CameraLensDirection.back).toList();
    if (backCameras.length > 1) {
      final idx = backCameras.indexOf(desc);
      if (idx == 0) return '1';
      if (idx == 1) return '0.5';
      if (idx == 2) return '3';
      if (idx == 3) return '5';
    }
    return '1';
  }

  @override
  void dispose() {
    logDebug('CameraScreen: dispose');
    WidgetsBinding.instance.removeObserver(this);
    _cameraSession++;
    _disposeController();
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    logDebug('CameraScreen.build');

    if (widget.cameras.isEmpty) {
      return Scaffold(
        body: AppSurface(
          child: SafeArea(
            child: Column(
              children: [
                ShellHeader(
                  status: 'simulator',
                  leading: IconButton(icon: const Icon(Icons.chevron_left), tooltip: 'Back', onPressed: () => Navigator.pop(context)),
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
                            subtitle: 'Run on a physical device to capture a Colombo image.',
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
                        icon: const Icon(Icons.photo_library, color: Colors.white),
                        onPressed: _openPhotoLibrary,
                        tooltip: 'Upload from library',
                      ),
                      IconButton(
                        icon: const Icon(Icons.settings, color: Colors.white),
                        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SettingsScreen(store: widget.store))),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                _UploadQueueBanner(queue: widget.uploadQueue),
                Padding(
                  padding: const EdgeInsets.only(bottom: 32.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(width: 48),
                      _buildCaptureButton(),
                      const SizedBox(width: 48),
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

  Widget _buildBody() {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam_off_outlined, color: Colors.white70, size: 48),
              const SizedBox(height: 16),
              Text(
                'Camera disconnected',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _initializing ? null : () => _initCamera(widget.cameras[_cameraIndex]),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reconnect Camera'),
              ),
            ],
          ),
        ),
      );
    }

    final controller = _controller;
    if (_initializing || controller == null || !controller.value.isInitialized) {
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
                  final newZoom = (_baseZoom * details.scale).clamp(_minZoom, _maxZoom);
                  if (newZoom != _currentZoom) {
                    setState(() => _currentZoom = newZoom);
                    controller.setZoomLevel(newZoom);
                  }
                },
                onTapDown: (details) {
                  final double x = details.localPosition.dx / constraints.maxWidth;
                  final double y = details.localPosition.dy / constraints.maxHeight;
                  controller.setFocusPoint(Offset(x, y));
                },
                child: CameraPreview(controller),
              ),
              if (widget.cameras.where((c) => c.lensDirection == CameraLensDirection.back).length > 1 && _controller?.description.lensDirection != CameraLensDirection.front)
                Positioned(
                  top: MediaQuery.paddingOf(context).top,
                  left: 0,
                  right: 0,
                  child: _buildLensChips(),
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

  Widget _buildLensChips() {
    final backCameras = widget.cameras.where((c) => c.lensDirection == CameraLensDirection.back).toList();
    if (backCameras.length <= 1) return const SizedBox.shrink();

    final labels = backCameras.map((c) => _lensLabel(c)).toList();

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 8,
        bottom: 8,
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisAlignment: backCameras.length <= 3 ? MainAxisAlignment.center : MainAxisAlignment.start,
          children: List.generate(backCameras.length * 2 - 1, (i) {
            if (i.isOdd) return const SizedBox(width: 24);
            final idx = i ~/ 2;
            final camera = backCameras[idx];
            final isSelected = widget.cameras.indexOf(camera) == _cameraIndex;
            final label = labels[idx];
            return GestureDetector(
              onTap: () => _selectLens(widget.cameras.indexOf(camera)),
              child: Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.white54,
                  fontSize: 15,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  Future<void> _selectLens(int index) async {
    if (index == _cameraIndex || _switching || _initializing) return;
    logDebug('CameraScreen.selectLens: $index');
    setState(() {
      _cameraIndex = index;
      _switching = true;
    });
    try {
      await _initCamera(widget.cameras[_cameraIndex]);
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  Widget _buildCaptureButton() {
    final controller = _controller;
    return FloatingActionButton.large(
      onPressed: _canCapture(controller) ? _capture : null,
      backgroundColor: Colors.white,
      foregroundColor: Colors.black,
      elevation: 0,
      shape: const CircleBorder(),
      child: _capturing ? const CircularProgressIndicator(color: Colors.black) : const SizedBox(),
    );
  }

  bool _canCapture(CameraController? controller) {
    return controller != null && controller.value.isInitialized && _appActive && !_initializing && !_capturing;
  }
}
