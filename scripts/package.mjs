// Builds the extension and zips dist/ into a versioned archive ready for the
// Chrome Web Store. Run with: npm run package

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const dist = resolve(root, 'dist');
const outDir = resolve(root, 'release');
const zipPath = resolve(outDir, `${pkg.name}-${pkg.version}.zip`);

console.log('Building…');
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

if (!existsSync(dist)) {
  console.error('dist/ not found after build.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true });

console.log(`Packaging ${zipPath}…`);
// Zip the contents of dist/ at the archive root (Web Store expects manifest.json
// at the top). Exclude sourcemaps — no need to ship them to the store.
execFileSync('zip', ['-r', '-q', zipPath, '.', '-x', '*.map'], { cwd: dist, stdio: 'inherit' });
console.log('Done.');
