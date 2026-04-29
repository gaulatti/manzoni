# Manzoni

A Flutter camera client that captures photos and uploads them to the [Colombo](https://github.com/gaulatti/colombo) backend.

## Features

- Live camera preview using the device camera
- One-tap photo capture and upload to Colombo via `POST /upload`
- Secure credential storage (Keychain on iOS, Encrypted SharedPreferences on Android)
- Upload progress indicator
- Displays `s3_url` and `assignment_id` returned by Colombo on success

## How to Run

### Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) ≥ 3.x
- A running instance of the Colombo backend (see [gaulatti/colombo](https://github.com/gaulatti/colombo))

### Steps

```bash
# Install dependencies
flutter pub get

# Run on a connected device or emulator
flutter run
```

## Configure Base URL & Credentials

1. Open the app and tap the **Settings** (⚙️) icon in the top-right corner.
2. Fill in:
   - **Base URL** — the root URL of your Colombo instance (e.g. `https://colombo.example.com`)
   - **Username** — your Colombo / CMS username
   - **Password / Key** — your Colombo credential or API key
3. Tap **Save**. Values are stored securely using `flutter_secure_storage`.

## Expected `/upload` Contract

```
POST <baseUrl>/upload
Content-Type: multipart/form-data

Headers:
  X-Colombo-Username: <username>
  X-Colombo-Password: <password-or-key>

Multipart field:
  file: <image bytes>

Response (JSON):
{
  "s3_url":       "https://bucket.s3.amazonaws.com/...",
  "assignment_id": "42"
}
```

## Running Tests

```bash
flutter test
```

Tests cover:

- `SettingsStore` — save/load round-trip using a mocked `FlutterSecureStorage`
- `ColomboApiClient` — upload success, 4xx error handling, and missing-field error handling using a mock `HttpClientAdapter`

