import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'colombo_api_client.dart';
import 'settings_store.dart';
import '../debug_log.dart';

enum UploadStatus { pending, uploading, success, failed }

class UploadTask {
  UploadTask({required this.path, required this.thumbnail});
  final String path;
  final String thumbnail;
  UploadStatus status = UploadStatus.pending;
  String? errorMessage;
  String? assignmentId;
  int progress = 0;
}

class UploadQueue extends ChangeNotifier {
  UploadQueue({required SettingsStore store}) : _store = store;

  final SettingsStore _store;
  final List<UploadTask> _tasks = [];
  bool _processing = false;
  String? _activeError;

  List<UploadTask> get tasks => List.unmodifiable(_tasks);
  bool get isUploading => _processing;
  bool get hasTasks => _tasks.isNotEmpty;
  int get pendingCount => _tasks.where((t) => t.status == UploadStatus.pending || t.status == UploadStatus.uploading).length;
  int get successCount => _tasks.where((t) => t.status == UploadStatus.success).length;
  int get failedCount => _tasks.where((t) => t.status == UploadStatus.failed).length;
  String? get activeError => _activeError;

  Future<void> addFiles(List<String> paths, List<String> thumbnails) async {
    if (paths.isEmpty) return;
    logDebug('UploadQueue.addFiles: ${paths.length} files added');
    for (int i = 0; i < paths.length; i++) {
      _tasks.add(UploadTask(path: paths[i], thumbnail: thumbnails[i]));
    }
    notifyListeners();
    if (!_processing) {
      _processNext();
    }
  }

  Future<void> _processNext() async {
    final pending = _tasks.where((t) => t.status == UploadStatus.pending).toList();
    if (pending.isEmpty) return;

    final settings = await _store.load(forceRefresh: true);
    final baseUrl = settings['baseUrl'];
    final username = settings['username'];
    final password = settings['password'];

    if (baseUrl == null || baseUrl.isEmpty || username == null || username.isEmpty || password == null || password.isEmpty) {
      logDebug('UploadQueue: aborting, missing settings');
      _activeError = 'Missing credentials. Configure settings to resume.';
      for (final task in pending) {
        task.status = UploadStatus.failed;
        task.errorMessage = _activeError;
      }
      _processing = false;
      notifyListeners();
      return;
    }

    _processing = true;
    notifyListeners();

    final client = ColomboApiClient(baseUrl: baseUrl, username: username, password: password);

    for (int i = 0; i < _tasks.length; i++) {
      final task = _tasks[i];
      if (task.status != UploadStatus.pending) continue;

      task.status = UploadStatus.uploading;
      task.progress = 0;
      notifyListeners();

      logDebug('UploadQueue: uploading $i: ${task.path}');

      try {
        final result = await client.uploadPhoto(
          filePath: task.path,
          contentType: 'image/jpeg',
          onSendProgress: (sent, total) {
            task.progress = ((sent / total) * 100).round();
            notifyListeners();
          },
        );
        logDebug('UploadQueue: upload $i success, assignmentId=${result.assignmentId}');
        task.status = UploadStatus.success;
        task.assignmentId = result.assignmentId;
        task.progress = 100;
      } on DioException catch (e) {
        logDebug('UploadQueue: upload $i failed: ${e.type}');
        task.status = UploadStatus.failed;
        task.errorMessage = _formatError(e);
      } catch (e) {
        logDebug('UploadQueue: upload $i error: $e');
        task.status = UploadStatus.failed;
        task.errorMessage = e.toString();
      }

      notifyListeners();
    }

    _processing = false;
    _activeError = null;
    notifyListeners();
  }

  Future<void> retryFailed() async {
    final failed = _tasks.where((t) => t.status == UploadStatus.failed).toList();
    if (failed.isEmpty) return;
    logDebug('UploadQueue.retryFailed: ${failed.length} tasks');
    for (final task in failed) {
      task.status = UploadStatus.pending;
      task.errorMessage = null;
      task.progress = 0;
    }
    _activeError = null;
    notifyListeners();
    if (!_processing) {
      _processNext();
    }
  }

  void clearCompleted() {
    _tasks.removeWhere((t) => t.status == UploadStatus.success || t.status == UploadStatus.failed);
    notifyListeners();
  }

  void cancelPending() {
    _tasks.removeWhere((t) => t.status == UploadStatus.pending);
    notifyListeners();
  }

  void dismissError() {
    _activeError = null;
    notifyListeners();
  }

  String _formatError(DioException e) {
    if (e.response != null) {
      if (e.response!.statusCode == 413) {
        return 'File too large (413)';
      }
      return 'Server error ${e.response!.statusCode}';
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'Request timed out';
      case DioExceptionType.connectionError:
        return 'Could not connect to server';
      default:
        return e.message ?? 'Unknown error';
    }
  }
}
