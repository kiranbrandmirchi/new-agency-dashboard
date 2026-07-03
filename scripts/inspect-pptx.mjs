import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const pptx = process.argv[2];
if (!pptx) {
  console.error('Usage: node scripts/inspect-pptx.mjs <path-to-pptx>');
  process.exit(1);
}

const tmp = '.tmp-sosrafa-inspect';
const zipCopy = '.tmp-sosrafa-inspect.zip';
if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
if (fs.existsSync(zipCopy)) fs.unlinkSync(zipCopy);
fs.mkdirSync(tmp);
fs.copyFileSync(pptx, zipCopy);
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' },
);

const slidesDir = path.join(tmp, 'ppt', 'slides');
const files = fs
  .readdirSync(slidesDir)
  .filter((f) => /^slide\d+\.xml$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

files.forEach((f, i) => {
  const xml = fs.readFileSync(path.join(slidesDir, f), 'utf8');
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const unique = [...new Set(texts)];
  console.log(`\n--- Slide ${i + 1} (${f}) ---`);
  unique.forEach((t) => console.log('  ', t));
});
