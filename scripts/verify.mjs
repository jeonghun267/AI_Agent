// Runs every automated check in order and stops at the first failure:
// syntax check, unit + HTTP tests, then the browser flow.
import {spawnSync} from 'node:child_process';

const steps = [
  ['syntax', ['scripts/check.mjs']],
  ['unit + http', ['--test', 'tests/unit/**/*.test.mjs', 'tests/http/**/*.test.mjs']],
  ['browser', ['--test', 'tests/browser/**/*.test.mjs']],
];

for (const [name, args] of steps) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, args, {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(`\n${name} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nAll checks passed.');
