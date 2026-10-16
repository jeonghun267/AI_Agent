// Operator backup: writes a consistent copy of the live SQLite database with
// VACUUM INTO (safe while the server is running).
//   npm run backup                    -> <DATA_DIR>/backups/relo-<timestamp>.sqlite
//   npm run backup -- D:\relo-backups -> that folder
//   npm run backup -- --verify        -> also checks every user's audit hash chain
// Copy the files somewhere off this machine; a backup on the same disk is not disaster recovery.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {loadConfig} from '../src/server/config.mjs';
import {createAuditRepository} from '../src/server/repositories/audit.repo.mjs';

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const config = loadConfig();
const targetDir = resolve(args.find(arg => !arg.startsWith('--')) ?? join(config.dataDir, 'backups'));
mkdirSync(targetDir, {recursive: true});

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(targetDir, `relo-${stamp}.sqlite`);
const db = new DatabaseSync(join(config.dataDir, 'relo.sqlite'), {timeout: 5000});
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  console.log(`Backup written: ${target} (${(statSync(target).size / 1024).toFixed(1)} KB)`);

  if (verify) {
    const audit = createAuditRepository(db);
    const owners = db.prepare('SELECT DISTINCT owner_id FROM audit').all().map(row => row.owner_id);
    const broken = owners.filter(owner => !audit.verifyChain(owner).valid);
    console.log(`Audit chains checked: ${owners.length}, broken: ${broken.length}`);
    if (broken.length) process.exitCode = 1;
  }
} finally {
  db.close();
}
