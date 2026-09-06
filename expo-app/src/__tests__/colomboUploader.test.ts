import { UploadType } from 'expo-file-system';

import { buildColomboUploadRequest, parseAcceptedUpload } from '../services/colomboUploader';

describe('Colombo accepted-upload contract', () => {
  const credentials = {
    baseUrl: 'https://colombo.example.com/',
    password: 'test-password',
    username: 'test-user',
  };

  test('builds the exact multipart field and credential headers', () => {
    const request = buildColomboUploadRequest(credentials, 'image/heic', jest.fn());

    expect(request.url).toBe('https://colombo.example.com/upload');
    expect(request.options).toMatchObject({
      fieldName: 'file',
      headers: {
        'X-Colombo-Password': 'test-password',
        'X-Colombo-Username': 'test-user',
      },
      httpMethod: 'POST',
      mimeType: 'image/heic',
      sessionType: 'foreground',
      uploadType: UploadType.MULTIPART,
    });
    expect(Object.keys(request.options.headers ?? {})).toEqual([
      'X-Colombo-Password',
      'X-Colombo-Username',
    ]);
  });

  test('parses a 202 accepted receipt without requiring s3_url', () => {
    expect(parseAcceptedUpload(202, JSON.stringify({
      assignment_id: 42,
      operation_id: '5f1d0f8e-0000-4000-8000-000000000001',
      status: 'accepted',
    }))).toEqual({
      assignmentId: '42',
      operationId: '5f1d0f8e-0000-4000-8000-000000000001',
      status: 'accepted',
    });
  });

  test.each([
    [200, { assignment_id: '42', operation_id: 'op-1', status: 'accepted' }],
    [202, { assignment_id: '42', operation_id: 'op-1', status: 'delivered' }],
    [202, { operation_id: 'op-1', status: 'accepted' }],
    // Without an operation id this device could never learn whether the file
    // was delivered, so the acceptance is unusable.
    [202, { assignment_id: '42', status: 'accepted' }],
    [202, { assignment_id: '42', operation_id: '   ', status: 'accepted' }],
  ])('rejects non-contract response %#', (status, body) => {
    expect(() => parseAcceptedUpload(status, JSON.stringify(body))).toThrow();
  });
});
