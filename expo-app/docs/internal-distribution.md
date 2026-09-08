# Internal distribution runbook

Manzoni's `internal` EAS profile is for signed, production-like candidates that
run without a development server. It is not a store-submission profile and it
does not authorize a production upload.

## Current blocked boundary

Do not create or share an internal candidate while the current Thompson Git pin
is present. `@gaulatti/thompson` is not published in the npm registry, and its
publication is owned by `gaulatti/thompson#16`. After that work completes, a
focused Manzoni change must replace the Git specifier with the exact published
version and commit the registry-resolved lockfile. `npm run candidate:verify`
enforces that boundary and must never be bypassed.

The first signed build also requires an authorized Expo account/project,
Android signing credentials, Apple Developer credentials, and registered iOS
device identifiers. Creating or changing those external resources requires
separate owner authorization. The authorized project ID must then be committed
as `expo.extra.eas.projectId`; candidate preflight rejects an unlinked app so a
build command cannot silently initialize an external project.

## Candidate identity and migration

The Expo candidate uses these application identities:

| Platform | Expo candidate | Flutter rollback client |
| --- | --- | --- |
| iOS | `com.gaulatti.manzoni` | `com.example.manzoni` |
| Android | `com.gaulatti.manzoni` | `com.example.manzoni` |

Because the identifiers differ, the first Expo candidate is a **clean install**,
not an in-place upgrade of the Flutter client. Its SQLite queue and SecureStore
credentials are separate by design and are not migrated. Keep the Flutter app
installed until its outstanding queue is settled, and enter Colombo credentials
again inside the Expo candidate. Never claim that credentials or pending media
crossed this boundary.

Subsequent Expo candidates keep `com.gaulatti.manzoni` and must increment
`ios.buildNumber` and `android.versionCode`. Install one over the preceding Expo
candidate and verify that SecureStore credentials, SQLite rows, app-owned media,
operation IDs, and last-known receipt states remain intact.

## Preflight and signed build

Start from the exact reviewed commit with a clean worktree:

```bash
cd expo-app
npm ci
npx expo-doctor
npm run check
npm run candidate:verify
```

The EAS CLI is pinned to `23.2.0` in `eas.json`; build scripts name that exact
version rather than relying on a global installation:

```bash
npm run build:internal:android
npm run build:internal:ios
```

EAS internal distribution creates an installable Android APK. The iOS artifact
uses ad hoc provisioning and installs only on devices present in its provisioning
profile. Record the EAS build ID and URL, Git commit SHA, profile, SDK and native
versions, artifact checksum, signing identity, and registered test-device model
and OS. Do not place signing credentials, device identifiers, or unauthenticated
download URLs in public evidence.

## Device and Colombo verification

Use representative physical iOS and Android devices. A simulator cannot prove
camera capture, signing, installation, or credential-vault persistence.

1. Confirm `https://colombo.gaulatti.com/actuator/health` returns HTTP `200`
   with `{"status":"UP"}`. This is service health only, not delivery proof.
2. Install and launch the signed candidate without Metro or another development
   server. Confirm the Thompson shell and all four tabs render.
3. Save the authorized Colombo URL and credentials in Settings. Do not capture
   the credential screen or values in evidence.
4. With the device offline, enqueue one non-sensitive camera or library fixture.
   Confirm the durable row and app-owned copy survive termination and relaunch,
   then show the bounded failed/retry presentation without duplicating an upload.
5. Restore connectivity, tap **Retry**, and confirm Colombo returns HTTP `202`
   with both an assignment and operation ID. Public evidence records only the
   state and timestamp, never the identifiers or media.
6. Take the device offline while Colombo owns the upload, then reconnect. Confirm
   the native connectivity event asks for a receipt, and that silence remains
   **Delivery unknown** rather than becoming delivered or retryable.
7. Follow the same operation through `accepted`, `uploading`, `delivered`, and
   the truthful terminal `callback-confirmed`, `failed`, or `expired` receipt.
   Record bounded attempt counts and failure code only.
8. Install the next higher build over this Expo candidate and prove the queue,
   media copy, credentials, and receipt state survive.

## Rollback

Retain the prior signed Expo artifact, exact Git SHA, EAS build record, checksum,
and signing identity. Roll back by installing a newly reviewed higher native
build that restores the prior code while keeping the same Expo application
identifiers and signing identity; mobile platforms do not accept an arbitrary
downgrade over a newer installed build. Verify the persisted queue before and
after rollback. Do not uninstall the candidate, clear application data, delete
queued media, or rotate credentials as a rollback shortcut.
