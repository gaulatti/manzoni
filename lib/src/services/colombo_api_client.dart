import 'dart:convert';

import 'package:dio/dio.dart';

import '../debug_log.dart';

/// Result returned by a successful upload.
class UploadResult {
  const UploadResult({required this.s3Url, required this.assignmentId});

  final String s3Url;
  final String assignmentId;

  @override
  String toString() =>
      'UploadResult(s3Url: $s3Url, assignmentId: $assignmentId)';
}

/// Wraps [Dio] to communicate with the Colombo HTTP upload endpoint.
///
/// Usage:
/// ```dart
/// final client = ColomboApiClient(
///   baseUrl: 'https://colombo.example.com',
///   username: 'user',
///   password: 'secret',
/// );
/// final result = await client.uploadPhoto(filePath: '/path/to/photo.jpg');
/// ```
class ColomboApiClient {
  ColomboApiClient({
    required String baseUrl,
    required String username,
    required String password,
    Dio? dio,
  }) : _username = username,
       _password = password,
       _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: baseUrl,
               connectTimeout: const Duration(seconds: 30),
               receiveTimeout: const Duration(seconds: 60),
             ),
           );

  final Dio _dio;
  final String _username;
  final String _password;

  /// Uploads [filePath] to `POST /upload` and returns an [UploadResult].
  ///
  /// Throws a [DioException] on HTTP errors or network failures.
  Future<UploadResult> uploadPhoto({
    required String filePath,
    void Function(int sent, int total)? onSendProgress,
  }) async {
    logDebug('ColomboApiClient.uploadPhoto: preparing multipart for $filePath');
    final formData = FormData.fromMap({
      'file': await traceDebug(
        'ColomboApiClient.MultipartFile.fromFile',
        () => MultipartFile.fromFile(filePath),
      ),
    });

    logDebug('ColomboApiClient.uploadPhoto: POST /upload');
    final response = await traceDebug(
      'ColomboApiClient.dio.post',
      () => _dio.post<dynamic>(
        '/upload',
        data: formData,
        options: Options(
          headers: {
            'X-Colombo-Username': _username,
            'X-Colombo-Password': _password,
          },
        ),
        onSendProgress: onSendProgress,
      ),
    );
    logDebug('ColomboApiClient.uploadPhoto: status ${response.statusCode}');

    final rawBody = response.data;
    if (rawBody == null) {
      throw const FormatException('Empty response body from /upload');
    }

    dynamic decodedBody = rawBody;
    if (decodedBody is String && decodedBody.isNotEmpty) {
      decodedBody = jsonDecode(decodedBody);
    }

    if (decodedBody is! Map<String, dynamic>) {
      throw FormatException(
        'Unexpected response type: ${decodedBody.runtimeType}',
      );
    }

    final body = decodedBody;

    final s3Url = body['s3_url'] as String?;
    final assignmentId = body['assignment_id']?.toString();

    if (s3Url == null || assignmentId == null) {
      throw FormatException(
        'Missing s3_url or assignment_id in response: $body',
      );
    }

    return UploadResult(s3Url: s3Url, assignmentId: assignmentId);
  }
}
