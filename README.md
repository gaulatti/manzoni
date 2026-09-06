# Manzoni

Manzoni is a mobile image-intake client for the [Colombo](https://github.com/gaulatti/colombo) backend. The repository keeps two clients side by side during the migration:

- `expo-app/` is the Expo/TypeScript client and the active migration path.
- The repository root remains the Flutter rollback/reference client.

Flutter has not been deleted or silently redirected. The clients have separate local state and credentials.

## Expo client

The Expo client uses Thompson for its shell, forms, status, progress, error, and queue presentation. Thompson is installed from the exact audited commit recorded in `expo-app/package.json` and `package-lock.json`; it never resolves through a sibling checkout.

Camera captures and library selections both follow the same path:

1. Restrict intake to images.
2. Copy the selected media into the app document directory under `upload-queue/`.
3. Insert metadata and lifecycle state into `manzoni-upload-queue.db`.
4. Upload sequentially using the credentials loaded from SecureStore.
5. Record Colombo's accepted receipt, or retain a retryable failure.

The SQLite table deliberately contains no credentials. SecureStore receives one serialized credential payload so a failed write cannot leave a mixed set of keys. On startup, any row left in `uploading` is changed to `failed` with an interrupted-upload message so the user can retry it, and copied media without a queue row is removed. Clearing an accepted row also removes its app-owned media copy.

The camera screen owns permission, unavailable-camera, foreground/suspended, rear/front facing, available iOS lens, zoom, focus-mode, capture, and enqueue states. A simulator can exercise the unavailable-camera and library flows, but physical capture behavior must be verified on a real device before release.

### Run Expo

Expo SDK 57 requires Node.js 22.13 or newer.

```bash
cd expo-app
npm ci
npm start
```

Use `npm run ios` or `npm run android` to open a development target. Store release and production deployment are outside this repository workflow.

### Configure Colombo

Open **Settings** and provide the Colombo base URL, username, and password/key. The Expo client stores all three values in platform SecureStore. They are not logged or copied into SQLite.

Manzoni sends exactly:

```text
POST <baseUrl>/upload
Content-Type: multipart/form-data
X-Colombo-Username: <username>
X-Colombo-Password: <password-or-key>

file: <image bytes>
```

The only successful client receipt is:

```json
{"status":"accepted","assignment_id":"42"}
```

It must arrive with HTTP `202`. The UI labels this state **Accepted by Colombo**. It does not require `s3_url`, and it never describes acceptance as delivery. Only a future final Colombo receipt may produce a delivered state.

### Verify Expo

```bash
cd expo-app
npx expo-doctor
npm run check
```

`npm run check` runs TypeScript, Jest contract tests, and Metro exports for iOS, Android, and web. Expo SQLite web exports require the committed Wasm Metro configuration. A deployed web target would additionally need `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers; no web deployment is included here.

## Flutter rollback client

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

The Flutter smoke test tracks the current `ManzoniApp` no-camera state. Flutter's legacy upload flow remains a rollback/reference path and is not the durable-queue implementation described above.
