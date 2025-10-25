import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function log(msg) {
  console.log(`[bootstrap-client] ${msg}`);
}

try {
  const candidateRoots = [
    process.env.CLIENT_DIST && path.resolve(process.env.CLIENT_DIST),
    path.join(serverDir, '../client/dist'),
    path.join(serverDir, 'client-dist'),
    path.join(serverDir, 'public'),
  ].filter(Boolean);

  let chosen = null;
  for (const root of candidateRoots) {
    if (exists(path.join(root, 'index.html'))) {
      chosen = root;
      break;
    }
  }

  if (chosen) {
    log(`found existing client build at: ${chosen}`);
    process.exit(0);
  }

  if (String(process.env.SKIP_CLIENT_BUILD).toLowerCase() === 'true') {
    log('SKIP_CLIENT_BUILD=true; skipping client build.');
    process.exit(0);
  }

  const clientDir = path.join(serverDir, '../client');
  if (!exists(clientDir)) {
    log(`client folder not present at ${clientDir}; skipping build.`);
    process.exit(0);
  }

  log('no client build found; attempting to build ../client');
  const ci = spawnSync('npm', ['ci'], { cwd: clientDir, stdio: 'inherit', shell: true });
  if (ci.status !== 0) {
    log(`npm ci failed with code ${ci.status}; continuing without client build.`);
    process.exit(0);
  }

  const build = spawnSync('npm', ['run', 'build'], { cwd: clientDir, stdio: 'inherit', shell: true });
  if (build.status !== 0) {
    log(`npm run build failed with code ${build.status}; continuing without client build.`);
    process.exit(0);
  }

  const from = path.join(clientDir, 'dist');
  const to = path.join(serverDir, 'client-dist');
  try {
    fs.mkdirSync(to, { recursive: true });
    // Node >=16: fs.cpSync supports recursive copy
    fs.cpSync(from, to, { recursive: true });
    log(`copied built client to ${to}`);
  } catch (e) {
    log(`failed to copy client build: ${e?.message || e}`);
  }
} catch (e) {
  log(`unexpected error: ${e?.message || e}`);
} finally {
  // Never block server start
  process.exit(0);
}

