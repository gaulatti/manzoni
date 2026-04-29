import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../debug_log.dart';
import '../services/colombo_api_client.dart';
import '../services/settings_store.dart';
import '../theme/manzoni_theme.dart';

/// Shows the captured image and lets the user upload it to Colombo.
class ReviewUploadScreen extends StatefulWidget {
  const ReviewUploadScreen({
    super.key,
    required this.imagePath,
    required this.store,
  });

  final String imagePath;
  final SettingsStore store;

  @override
  State<ReviewUploadScreen> createState() => _ReviewUploadScreenState();
}

class _ReviewUploadScreenState extends State<ReviewUploadScreen> {
  bool _uploading = false;
  double _progress = 0;
  UploadResult? _result;
  String? _error;

  Future<void> _upload() async {
    logDebug('ReviewUploadScreen.upload: pressed');
    setState(() {
      _uploading = true;
      _progress = 0;
      _result = null;
      _error = null;
    });

    try {
      final settings = await traceDebug(
        'ReviewUploadScreen.store.load',
        widget.store.load,
      );
      final baseUrl = settings['baseUrl'];
      final username = settings['username'];
      final password = settings['password'];

      if (baseUrl == null ||
          baseUrl.isEmpty ||
          username == null ||
          username.isEmpty ||
          password == null ||
          password.isEmpty) {
        logDebug('ReviewUploadScreen.upload: missing settings');
        setState(() {
          _error =
              'Please configure Base URL, Username and Password in Settings.';
          _uploading = false;
        });
        return;
      }

      logDebug('ReviewUploadScreen.upload: creating client for $baseUrl');
      final client = ColomboApiClient(
        baseUrl: baseUrl,
        username: username,
        password: password,
      );

      final result = await traceDebug(
        'ReviewUploadScreen.client.uploadPhoto',
        () => client.uploadPhoto(
          filePath: widget.imagePath,
          onSendProgress: (sent, total) {
            logDebug('ReviewUploadScreen.upload: progress $sent/$total');
            if (total > 0 && mounted) {
              setState(() => _progress = sent / total);
            }
          },
        ),
      );

      if (mounted) {
        setState(() {
          _result = result;
          _uploading = false;
        });
        logDebug('ReviewUploadScreen.upload: success');
      }
    } on DioException catch (e) {
      if (mounted) {
        logDebug('ReviewUploadScreen.upload: DioException ${e.type}');
        setState(() {
          _error = _dioErrorMessage(e);
          _uploading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        logDebug('ReviewUploadScreen.upload: failed $e');
        setState(() {
          _error = e.toString();
          _uploading = false;
        });
      }
    }
  }

  String _dioErrorMessage(DioException e) {
    if (e.response != null) {
      return 'Server error ${e.response!.statusCode}: '
          '${e.response!.data ?? e.message}';
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

  @override
  Widget build(BuildContext context) {
    logDebug('ReviewUploadScreen.build');
    return Scaffold(
      body: AppSurface(
        child: SafeArea(
          child: Column(
            children: [
              ShellHeader(
                status: _uploading ? 'uploading' : 'review',
                leading: IconButton(
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Back',
                  onPressed: () => Navigator.pop(context),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 620),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Panel(
                            padding: EdgeInsets.zero,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.file(
                                File(widget.imagePath),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_uploading)
                            Panel(
                              child: Column(
                                children: [
                                  LinearProgressIndicator(
                                    value: _progress > 0 ? _progress : null,
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    _progress > 0
                                        ? 'Uploading ${(_progress * 100).toStringAsFixed(0)}%'
                                        : 'Preparing upload',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          if (_result != null) ...[
                            _SuccessBanner(result: _result!),
                          ],
                          if (_error != null) ...[
                            _ErrorBanner(message: _error!),
                          ],
                          const SizedBox(height: 12),
                          if (!_uploading)
                            FilledButton.icon(
                              onPressed: _upload,
                              icon: const Icon(Icons.cloud_upload_outlined),
                              label: Text(
                                _result != null ? 'Upload Again' : 'Upload',
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
        ),
      ),
    );
  }
}

class _SuccessBanner extends StatelessWidget {
  const _SuccessBanner({required this.result});

  final UploadResult result;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: ManzoniColors.sea.withValues(alpha: 0.12),
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle, color: ManzoniColors.sea),
                const SizedBox(width: 8),
                Text(
                  'Upload successful!',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: ManzoniColors.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _LabeledValue(label: 'Assignment ID', value: result.assignmentId),
            const SizedBox(height: 4),
            _LabeledValue(label: 'S3 URL', value: result.s3Url),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: ManzoniColors.terracotta.withValues(alpha: 0.12),
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, color: ManzoniColors.terracotta),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(color: ManzoniColors.textPrimary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LabeledValue extends StatelessWidget {
  const _LabeledValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
        Text(value, style: const TextStyle(fontSize: 14)),
      ],
    );
  }
}
