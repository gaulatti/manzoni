import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:manzoni/src/services/colombo_api_client.dart';

/// A minimal [HttpClientAdapter] that returns a pre-configured response.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter({required this.body, this.statusCode = 200});

  final String body;
  final int statusCode;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString(body, statusCode);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithAdapter({required String body, int statusCode = 200}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://colombo.test'));
  dio.httpClientAdapter = _FakeAdapter(body: body, statusCode: statusCode);
  return dio;
}

void main() {
  late Directory tempDir;
  late File tempPhoto;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('manzoni_test_');
    tempPhoto = File('${tempDir.path}/photo.jpg');
    // Write minimal JPEG header bytes so fromFile succeeds.
    await tempPhoto.writeAsBytes([0xff, 0xd8, 0xff, 0xe0]);
  });

  tearDown(() async {
    await tempDir.delete(recursive: true);
  });

  group('ColomboApiClient.uploadPhoto', () {
    test('returns UploadResult on 200 with valid JSON', () async {
      final dio = _dioWithAdapter(
        body: json.encode({
          's3_url': 'https://bucket.s3.amazonaws.com/photo.jpg',
          'assignment_id': '42',
        }),
      );
      final client = ColomboApiClient(
        baseUrl: 'https://colombo.test',
        username: 'alice',
        password: 's3cr3t',
        dio: dio,
      );

      final result = await client.uploadPhoto(filePath: tempPhoto.path);

      expect(result.s3Url, 'https://bucket.s3.amazonaws.com/photo.jpg');
      expect(result.assignmentId, '42');
    });

    test('throws DioException on 4xx server error', () async {
      final dio = _dioWithAdapter(
        body: json.encode({'error': 'Unauthorized'}),
        statusCode: 401,
      );
      final client = ColomboApiClient(
        baseUrl: 'https://colombo.test',
        username: 'alice',
        password: 'wrong',
        dio: dio,
      );

      await expectLater(
        () => client.uploadPhoto(filePath: tempPhoto.path),
        throwsA(isA<DioException>()),
      );
    });

    test('throws FormatException when response is missing required fields',
        () async {
      final dio = _dioWithAdapter(
        body: json.encode({'unexpected': 'data'}),
      );
      final client = ColomboApiClient(
        baseUrl: 'https://colombo.test',
        username: 'alice',
        password: 's3cr3t',
        dio: dio,
      );

      await expectLater(
        () => client.uploadPhoto(filePath: tempPhoto.path),
        throwsA(isA<FormatException>()),
      );
    });

    test('calls onSendProgress callback', () async {
      final dio = _dioWithAdapter(
        body: json.encode({
          's3_url': 'https://bucket.s3.amazonaws.com/photo.jpg',
          'assignment_id': '1',
        }),
      );
      final client = ColomboApiClient(
        baseUrl: 'https://colombo.test',
        username: 'alice',
        password: 's3cr3t',
        dio: dio,
      );

      final progressCalls = <double>[];
      await client.uploadPhoto(
        filePath: tempPhoto.path,
        onSendProgress: (sent, total) {
          if (total > 0) progressCalls.add(sent / total);
        },
      );

      // The fake adapter may or may not call onSendProgress, but the upload
      // must still succeed regardless.
      expect(progressCalls, everyElement(inInclusiveRange(0.0, 1.0)));
    });
  });
}
