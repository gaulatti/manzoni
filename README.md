# Manzoni

Manzoni is a mobile image-intake client for the [Colombo](https://github.com/gaulatti/colombo) backend. The repository keeps two clients side by side during the migration:

- `expo-app/` is the Expo/TypeScript client and the active migration path.
- The repository root remains the Flutter rollback/reference client.

Flutter has not been deleted or silently redirected. The clients have separate local state and credentials.

## Expo client

The Expo client uses Thompson for its shell, forms, status, progress, error, and queue presentation. Thompson is currently installed from the exact audited commit recorded in `expo-app/package.json` and `package-lock.json`; it never resolves through a sibling checkout. Internal distribution is fail-closed until Thompson's separately tracked registry publication is available and the dependency and lockfile use that exact immutable version.

Camera captures and library selections both follow the same path:

1. Restrict intake to images.
2. Copy the selected media into the app document directory under `upload-queue/`.
3. Insert metadata and lifecycle state into `manzoni-upload-queue.db`.
4. Upload sequentially using the credentials loaded from SecureStore.
5. Record Colombo's accepted receipt — including its `operation_id` — or retain a retryable failure.
6. Poll `GET /uploads/{operation_id}` until Colombo reports a terminal outcome.

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
{"status":"accepted","assignment_id":"42","operation_id":"5f1d0f8e-…"}
```

It must arrive with HTTP `202`. The UI labels this state **Accepted by Colombo**. It does not require `s3_url`, and it never describes acceptance as delivery. The `operation_id` is required: without it the client could never learn the real outcome, so an acceptance that omits it is rejected.

### Delivery reconciliation

Colombo returns `202` once a file is in a restart-safe spool. Delivery to S3 and
the CMS callback happen afterwards and are retried independently, so **acceptance
is a promise to deliver, not a completed delivery**. The client learns the real
outcome only by polling the landed receipt contract:

```text
GET <baseUrl>/uploads/<operation_id>
X-Colombo-Username: <username>
X-Colombo-Password: <password-or-key>
```

Every state Colombo reports maps to exactly one thing the queue shows:

| Colombo `state` | Queue shows | Terminal | May upload again |
| --- | --- | --- | --- |
| `accepted`, `uploading` | Accepted by Colombo | no | no |
| `delivered` | Delivered | no | no |
| `callback-confirmed` | Confirmed by the newsroom | yes | no |
| `failed` | Failed, with Colombo's bounded failure code | yes | yes |
| `expired` (HTTP `410`) | Expired | yes | yes |
| *no answer* | **Delivery unknown** | no | no |

Two rules are enforced in `src/domain/reconciliation.ts` rather than in the UI:

- **No local timer may infer delivery.** A row advances only on a receipt. The
  foreground poll only *asks*.
- **A status failure is not an answer.** A `404`, a `401`, a `5xx`, a network
  error, or a receipt whose `state` is outside the contract leaves the row
  `unknown` and retryable — never `failed`, never `delivered`. Re-uploading is
  refused while Colombo may still be working, so a transient outage can never
  become a duplicate delivery.

Reconciliation runs on launch, on every return to the foreground, on an actual
offline-to-online transition, on a slow foreground poll, and on the queue's
**Check delivery** button. A user refresh ignores per-row backoff; every other
trigger respects it. Rows are removed only when the user asks *and* Colombo has
reached a terminal state.

An install created before this release is migrated with `ALTER TABLE ADD COLUMN`
(guarded by `PRAGMA user_version`), so existing rows and their app-owned media
copies survive.

### Verify Expo

```bash
cd expo-app
npx expo-doctor
npm run check
```

`npm run check` runs TypeScript, Jest contract tests, and Metro exports for iOS, Android, and web. Expo SQLite web exports require the committed Wasm Metro configuration. A deployed web target would additionally need `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers; no web deployment is included here.

### Internal distribution

`expo-app/eas.json` defines a clean-commit-only `internal` profile. It produces
an installable Android APK or an ad hoc provisioned iOS build without a
development server. Run `npm run candidate:verify` before either signed build;
the guard rejects Git, file, range, and tag-based Thompson dependencies and
requires an exact `registry.npmjs.org` lockfile resolution with integrity.

The guard intentionally fails today because `@gaulatti/thompson` has not been
published to npm. Do not bypass it or build a distribution candidate from the
current Git pin. See the [internal distribution runbook](expo-app/docs/internal-distribution.md)
for the external prerequisites, clean-install migration boundary, device test,
Colombo receipt proof, and rollback record.

## Flutter rollback client

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

The Flutter smoke test tracks the current `ManzoniApp` no-camera state. Flutter's legacy upload flow remains a rollback/reference path and is not the durable-queue implementation described above.
