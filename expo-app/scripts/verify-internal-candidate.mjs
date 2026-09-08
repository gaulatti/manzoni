import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const THOMPSON_PACKAGE = '@gaulatti/thompson';
const THOMPSON_REGISTRY_PREFIX = 'https://registry.npmjs.org/@gaulatti/thompson/-/';

export function validateInternalCandidate({ appConfig, easConfig, lockfile, packageJson }) {
  const errors = [];
  const expo = appConfig?.expo;
  const profile = easConfig?.build?.internal;
  const thompsonVersion = packageJson?.dependencies?.[THOMPSON_PACKAGE];
  const lockedThompson = lockfile?.packages?.[`node_modules/${THOMPSON_PACKAGE}`];

  if (easConfig?.cli?.requireCommit !== true) {
    errors.push('EAS must require a clean Git commit before an internal build.');
  }
  if (easConfig?.cli?.version !== '23.2.0') {
    errors.push('The reviewed EAS CLI version must remain pinned to 23.2.0.');
  }
  if (profile?.distribution !== 'internal' || profile?.environment !== 'preview') {
    errors.push('The internal profile must use internal distribution and the preview environment.');
  }
  if (!expo?.ios?.bundleIdentifier || !expo?.android?.package) {
    errors.push('Both platform application identifiers are required.');
  }
  if (!expo?.extra?.eas?.projectId) {
    errors.push('An authorized EAS project ID is required before an internal build.');
  }
  if (!expo?.ios?.buildNumber || !Number.isInteger(expo?.android?.versionCode)) {
    errors.push('Both platform build numbers are required.');
  }
  if (typeof thompsonVersion !== 'string' || !EXACT_VERSION.test(thompsonVersion)) {
    errors.push('Thompson must be an exact published version, not a Git, file, tag, or range dependency.');
  }
  if (
    !lockedThompson ||
    lockedThompson.version !== thompsonVersion ||
    typeof lockedThompson.resolved !== 'string' ||
    !lockedThompson.resolved.startsWith(THOMPSON_REGISTRY_PREFIX) ||
    typeof lockedThompson.integrity !== 'string' ||
    !lockedThompson.integrity.startsWith('sha512-')
  ) {
    errors.push('The lockfile must resolve that exact Thompson version and integrity from registry.npmjs.org.');
  }

  return errors;
}

function readJson(root, name) {
  return JSON.parse(readFileSync(join(root, name), 'utf8'));
}

function run() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const errors = validateInternalCandidate({
    appConfig: readJson(root, 'app.json'),
    easConfig: readJson(root, 'eas.json'),
    lockfile: readJson(root, 'package-lock.json'),
    packageJson: readJson(root, 'package.json'),
  });
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const gitStatus = execFileSync('git', ['status', '--porcelain'], {
    cwd: gitRoot,
    encoding: 'utf8',
  }).trim();
  if (gitStatus) errors.push('Internal candidates must be built from a clean committed worktree.');

  if (errors.length > 0) {
    for (const error of errors) console.error(`candidate-preflight: ${error}`);
    process.exitCode = 1;
    return;
  }

  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: gitRoot,
    encoding: 'utf8',
  }).trim();
  console.log(`candidate-preflight: ready at ${sha}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
