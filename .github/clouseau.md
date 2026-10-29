# Manzoni review contract

Manzoni is the mobile image-intake client for the Colombo backend. The Expo/
TypeScript client in `expo-app/` is the active path; the Flutter client at the
repository root is the rollback and reference client and is not silently
redirected. A capture or library selection is restricted to images, copied into
app storage, recorded in a credential-free local queue, uploaded sequentially
with credentials from SecureStore, and tracked to Colombo's terminal outcome.

Preserve the upload path (image-only intake, app-owned media copies,
credential-free SQLite queue, atomic credential storage, interrupted-upload
recovery and cleanup), the separation between the Expo and Flutter clients'
state, and the fail-closed internal-distribution gate that requires Thompson to
resolve to an exact immutable registry version. Bug fixes, meaningful tests,
accessibility, documentation and dependency maintenance serve this existing app
without a new product decision. A new backend contract, a new credential
storage path or a change to the distribution gate needs documentation or a
linked requirement that establishes its need and limits. Builds for store or
internal distribution stay separate, explicitly authorized actions.

Assess purpose and evidence rather than the number of changed files or lines.
Ask gaulatti for a second opinion for a product-direction or authority decision.
Ordinary implementation uncertainty and repairable bugs belong to automated
investigation, not routine human code review. Changes to review controls (this
contract, `.github/clouseau.json`, the CI workflow, the local recipe) require
explicit owner confirmation.

Every material capability and mechanism must independently score at least 80
for fit, need and proportionality under Clouseau's shared protocol. A causal
technical finding at or above 70 blocks; unrelated features or good scores
cannot average away a defect. Integrity and review-completeness gates remain
independent.

Tests must assert actual behaviour. Reject fabricated coverage, disabled tests,
coverage pragmas or exclusions, swallowed errors and unconditional assertions.
The type check, Jest suite, candidate-configuration test and the Expo export
remain mandatory. The shared coverage gate reads only the Expo client
(`expo-app/src`) and requires exactly 100% line and branch coverage; the Flutter
client has no supported native coverage format in the shared engine and is not
measured, so pull requests are merged by the owner rather than automatically.
