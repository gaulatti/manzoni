import 'package:dio/dio.dart';

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
  })  : _username = username,
        _password = password,
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 30),
              receiveTimeout: const Duration(seconds: 60),
            ));

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
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });

    final response = await _dio.post<Map<String, dynamic>>(
      '/upload',
      data: formData,
      options: Options(
        headers: {
          'X-Colombo-Username': _username,
          'X-Colombo-Password': _password,
        },
      ),
      onSendProgress: onSendProgress,
    );

    final body = response.data;
    if (body == null) {
      throw const FormatException('Empty response body from /upload');
    }

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
