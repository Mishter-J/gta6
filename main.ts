// Port Meridian — make.fun gta6-01 entrypoint (program/v1, Node 22).
//
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from the
// kit's vendor/makefun-game.ts (unchanged). Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output. Deterministic: the same
// repository always writes the same bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const name of ['game', 'screenshots']) {
    const source = join(REPO_ROOT, name);
    if (!existsSync(source)) throw new Error(`missing ${name}/ in the repository`);
    cpSync(source, join(OUTPUT_DIR, name), { recursive: true });
  }
  const dossier = buildDossier(OUTPUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
}

main();
