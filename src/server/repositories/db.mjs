import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {nowIso} from '../domain/primitives.mjs';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const depth = new WeakMap();

export function openDatabase(dataDir) {
  mkdirSync(dataDir, {recursive: true});
  const db = new DatabaseSync(join(dataDir, 'relo.sqlite'), {timeout: 5000});
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  runMigrations(db);
  return db;
}

// Runs fn inside one IMMEDIATE transaction. Nested calls join the outer
// transaction, so services can compose without worrying about BEGIN twice.
export function transaction(db, fn) {
  const level = depth.get(db) ?? 0;
  depth.set(db, level + 1);
  try {
    if (level > 0) return fn();
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    depth.set(db, level);
  }
}

// Applies each migrations/NNN_name.sql once, in file-name order.
function runMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(row => row.name));
  const files = readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    transaction(db, () => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(name, nowIso());
    });
  }
}
