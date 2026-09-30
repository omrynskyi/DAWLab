/**
 * Loopback HTTP server for audio playback.
 *
 * Chromium's media pipeline cannot reliably seek or resume over a custom
 * protocol (a seek or a resume after backgrounding kills the element with
 * "data source error"), but it handles plain HTTP Range requests well. So the
 * renderer plays previews from here. The server only listens on 127.0.0.1,
 * requires a random per-launch token in the URL, and only serves existing
 * regular files whose path the main process handed out via getMediaUrl().
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { audioMimeType, resolveRange } from './range';

const token = crypto.randomBytes(16).toString('hex');
let starting: Promise<number> | null = null;
let server: http.Server | null = null;

function handle(req: http.IncomingMessage, res: http.ServerResponse, port: number) {
  const fail = (status: number, headers: http.OutgoingHttpHeaders = {}) => {
    res.writeHead(status, headers);
    res.end();
  };

  // Reject anything not addressed to us by IP (DNS-rebinding defence).
  if (req.headers.host !== `127.0.0.1:${port}`) return fail(403);
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, { Allow: 'GET, HEAD' });

  const [, reqToken, encoded] = (req.url ?? '').split('?')[0].split('/');
  if (reqToken !== token || !encoded) return fail(404);

  let filePath: string;
  try {
    filePath = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return fail(400);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return fail(404);

    const size = stats.size;
    const range = resolveRange(req.headers.range, size);
    if (range.kind === 'unsatisfiable') return fail(416, { 'Content-Range': `bytes */${size}` });

    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': audioMimeType(path.extname(filePath)),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': size === 0 ? 0 : range.end - range.start + 1,
    };
    if (range.kind === 'partial') headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;

    res.writeHead(range.kind === 'partial' ? 206 : 200, headers);
    if (req.method === 'HEAD' || size === 0) return res.end();

    const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    stream.on('error', () => res.destroy());
    // The browser aborts in-flight requests on seek; don't leak the file handle.
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

function ensureServer(): Promise<number> {
  if (starting) return starting;
  starting = new Promise<number>((resolve, reject) => {
    const s = http.createServer((req, res) => handle(req, res, (s.address() as AddressInfo).port));
    s.once('error', (err) => {
      starting = null;
      reject(err);
    });
    s.listen(0, '127.0.0.1', () => {
      s.unref();
      server = s;
      resolve((s.address() as AddressInfo).port);
    });
  });
  return starting;
}

/** URL the renderer's <audio> element can play (and seek) for a local audio file. */
export async function getMediaUrl(filePath: string): Promise<string> {
  const port = await ensureServer();
  return `http://127.0.0.1:${port}/${token}/${Buffer.from(filePath, 'utf8').toString('base64url')}`;
}

export function stopMediaServer(): void {
  server?.close();
  server = null;
  starting = null;
}
