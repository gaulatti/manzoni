import assert from 'node:assert/strict';
import test from 'node:test';

import { validateInternalCandidate } from './verify-internal-candidate.mjs';

function candidate(overrides = {}) {
  return {
    appConfig: {
      expo: {
        android: { package: 'com.gaulatti.manzoni', versionCode: 1 },
        extra: { eas: { projectId: '00000000-0000-0000-0000-000000000007' } },
        ios: { buildNumber: '1', bundleIdentifier: 'com.gaulatti.manzoni' },
      },
    },
    easConfig: {
      build: { internal: { distribution: 'internal', environment: 'preview' } },
      cli: { requireCommit: true, version: '23.2.0' },
    },
    lockfile: {
      packages: {
        'node_modules/@gaulatti/thompson': {
          integrity: 'sha512-reviewed',
          resolved: 'https://registry.npmjs.org/@gaulatti/thompson/-/thompson-0.1.0.tgz',
          version: '0.1.0',
        },
      },
    },
    packageJson: { dependencies: { '@gaulatti/thompson': '0.1.0' } },
    ...overrides,
  };
}

test('accepts a clean immutable registry dependency and internal profile', () => {
  assert.deepEqual(validateInternalCandidate(candidate()), []);
});

test('rejects every non-registry Thompson source', () => {
  for (const specifier of [
    '^0.1.0',
    'latest',
    'file:../thompson',
    'github:gaulatti/thompson#b0fba61b',
  ]) {
    const input = candidate();
    input.packageJson.dependencies['@gaulatti/thompson'] = specifier;

    assert.match(validateInternalCandidate(input).join('\n'), /exact published version/);
  }
});

test('rejects a lockfile that falls back outside the npm registry', () => {
  const input = candidate();
  input.lockfile.packages['node_modules/@gaulatti/thompson'].resolved =
    'git+ssh://git@github.com/gaulatti/thompson.git#b0fba61b';

  assert.match(validateInternalCandidate(input).join('\n'), /registry\.npmjs\.org/);
});

test('requires the reviewed signed-build identity and profile controls', () => {
  const input = candidate({
    appConfig: { expo: { android: {}, ios: {} } },
    easConfig: { build: { internal: {} }, cli: {} },
  });
  const errors = validateInternalCandidate(input).join('\n');

  assert.match(errors, /clean Git commit/);
  assert.match(errors, /EAS CLI version/);
  assert.match(errors, /internal distribution/);
  assert.match(errors, /application identifiers/);
  assert.match(errors, /EAS project ID/);
  assert.match(errors, /build numbers/);
});
