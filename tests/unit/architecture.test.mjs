// Enforces the layer rules in docs/ARCHITECTURE.md by reading the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function files(dir) {
  return readdirSync(join(root, dir), {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.mjs') ? [join(dir, entry.name)] : []);
}

// Rules apply to code, not to comments that merely mention a forbidden API.
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = file => stripComments(readFileSync(join(root, file), 'utf8'));
const imports = source => [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]);

function violations(dir, check) {
  return files(dir).flatMap(file => check(read(file), file).map(problem => `${relative(root, join(root, file))}: ${problem}`));
}

test('server: domain is pure, only repositories touch SQL, routes do not open transactions', () => {
  const problems = [
    ...violations('src/server/domain', source => imports(source)
      .filter(path => !path.startsWith('./') && path !== 'node:crypto')
      .map(path => `domain imports ${path}`)),
    ...violations('src/server/services', source => /\.prepare\(|\.exec\(/.test(source) ? ['service runs SQL'] : []),
    ...violations('src/server/routes', source => [
      ...(/\.prepare\(|transaction\(/.test(source) ? ['route runs SQL or opens a transaction'] : []),
      ...imports(source).filter(path => path.includes('repositories')).map(path => `route imports ${path}`),
    ]),
  ];
  assert.deepEqual(problems, []);
});

test('web: views never fetch, view models never touch the DOM, models hold no state', () => {
  const problems = [
    ...violations('src/web/views', source => [
      ...(/\bfetch\(/.test(source) ? ['view calls fetch'] : []),
      ...imports(source).filter(path => path.includes('/models/')).map(path => `view imports ${path}`),
    ]),
    ...violations('src/web/viewmodels', source => /\b(document|window|localStorage|location)\./.test(source) ? ['view model touches the DOM or window'] : []),
    ...violations('src/web/models', source => [
      ...(/\b(document|window)\./.test(source) ? ['model touches the DOM'] : []),
      ...(/^\s*let /m.test(source) ? ['model keeps mutable state'] : []),
    ]),
  ];
  assert.deepEqual(problems, []);
});
