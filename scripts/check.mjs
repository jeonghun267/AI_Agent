// Syntax-checks every .mjs file under src/, scripts/ and tests/ with `node --check`.
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join, relative} from 'node:path';

const root = join(import.meta.dirname, '..');

function* modules(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* modules(path);
    else if (entry.name.endsWith('.mjs')) yield path;
  }
}

let failed = 0;
let count = 0;
for (const folder of ['src', 'scripts', 'tests']) {
  for (const file of modules(join(root, folder))) {
    count += 1;
    const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    if (result.status !== 0) {
      failed += 1;
      console.error(`✖ ${relative(root, file)}\n${result.stderr}`);
    }
  }
}
console.log(`${count - failed}/${count} modules passed the syntax check.`);
process.exitCode = failed ? 1 : 0;
