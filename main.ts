// main.ts — SKYRING COURIER hand-in (Node 22, standard library only).
//
// Stages the finished game for the make.fun judge: it mirrors game/ and
// screenshots/ from this repository into the output directory and writes
// /output/dossier.json through the vendored make.fun library. The grader
// runs `node main.ts` with no network and a 10 s wall budget, so this file
// does nothing but copy, describe and log. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output is deterministic: the same repository always produces the
// same bytes, which is what the grader's run_deterministic check verifies.
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Scorer caps (reference/gate.json). text_max_bytes shapes the dossier;
// the rest refuse an entry the scorer would refuse anyway, so failing
// here with a readable message beats a silent grading rejection.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const GAME_DIR = 'game';
const SHOTS_DIR = 'screenshots';
const DOSSIER_FILE = 'dossier.json';

function resolveDirs() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)));
  const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  return { repo, out };
}

function requireShippable(repo: string): void {
  for (const dir of [GAME_DIR, SHOTS_DIR]) {
    const p = join(repo, dir);
    if (!existsSync(p)) throw new Error(`missing ${dir}/ beside main.ts (${p})`);
  }
  const shots = ['01-cover.jpg', '02-menu.jpg', '03-runway.jpg', '04-ring.jpg'];
  for (const shot of shots) {
    const p = join(repo, SHOTS_DIR, shot);
    if (!existsSync(p)) throw new Error(`missing screenshot ${p}`);
    const size = statSync(p).size;
    if (size > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`screenshot ${shot} is ${size} bytes (cap ${DOSSIER_CAPS.screenshots.max_bytes})`);
    }
  }
}

function stageGame(repo: string, out: string): void {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(repo, GAME_DIR), join(out, GAME_DIR), { recursive: true });
  cpSync(join(repo, SHOTS_DIR), join(out, SHOTS_DIR), { recursive: true });
}

function handIn(): void {
  const { repo, out } = resolveDirs();
  requireShippable(repo);
  stageGame(repo, out);
  const dossier = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(join(out, DOSSIER_FILE), dossier);
  console.log(`SKYRING COURIER handed in to ${out} — dossier.json ${dossier.length} bytes`);
}

try {
  handIn();
} catch (err) {
  console.error(`hand-in failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
