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
    expect(parseAcceptedUpload(202, JSON.stringify({ assignment_id: 42, status: 'accepted' }))).toEqual({
      assignmentId: '42',
      status: 'accepted',
    });
  });

  test.each([
    [200, { assignment_id: '42', status: 'accepted' }],
    [202, { assignment_id: '42', status: 'delivered' }],
    [202, { status: 'accepted' }],
  ])('rejects non-contract response %#', (status, body) => {
    expect(() => parseAcceptedUpload(status, JSON.stringify(body))).toThrow();
  });
});
