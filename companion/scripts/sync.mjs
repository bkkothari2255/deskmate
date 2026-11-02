// Copies the shared UI from the Chrome extension into the Mac app,
// so both always ship the same desk, popup (mini office), bubble and call screens.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(here, '../../extension');
const out = path.resolve(here, '../app');
const REQUIRED = ['lib', 'sidepanel', 'bubble', 'call', 'models'];
const OPTIONAL = ['popup'];   // the compact mini-office page; the app falls back to the lite desk without it
fs.rmSync(out, { recursive: true, force: true });
for (const dir of [...REQUIRED, ...OPTIONAL]) {
  const src = path.join(ext, dir);
  if (!fs.existsSync(src)) {
    if (REQUIRED.includes(dir)) throw new Error(`missing extension/${dir}`);
    console.log(`(skipped extension/${dir}: not there yet)`);
    continue;
  }
  fs.cpSync(src, path.join(out, dir), { recursive: true });
}
console.log('Synced shared UI → companion/app');
