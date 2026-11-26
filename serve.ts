// serve.ts — local play-test server for SKYRING COURIER (Node 22, stdlib only).
//
// Serves game/ on http://127.0.0.1:8080 so the game can be played in a
// desktop browser with no build step and no network:
//
//   node serve.ts            # port 8080
//   node serve.ts 8091       # any port
//   node serve.ts --port 8091
//
// This is a development convenience, not a public web server: it only
// serves files under game/, refuses directory traversal with 403, streams
// files instead of buffering them, and answers HEAD as well as GET.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(argv: string[]): number {
  const flagAt = argv.indexOf('--port');
  const raw = flagAt === -1 ? argv[0] : argv[flagAt + 1];
  const n = Number(raw ?? 8080);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function resolveGameFile(requestedPath: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestedPath);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return null; // traversal
  return file;
}

const port = pickPort(process.argv.slice(2));

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const file = resolveGameFile(url.pathname);
  if (file === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('bad request');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
})
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`port ${port} is already in use — pick another: node serve.ts <port>`);
      process.exit(1);
    }
    throw err;
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`SKYRING COURIER at http://127.0.0.1:${port}/`);
  });
