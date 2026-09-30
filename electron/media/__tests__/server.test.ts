import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { getMediaUrl, stopMediaServer } from '../server';

// Node's http client, not fetch: the DOM test environment enforces CORS on fetch.
function request(url: string, headers: http.OutgoingHttpHeaders = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

describe('media server', () => {
  let dir: string;
  let file: string;
  const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-server-'));
    file = path.join(dir, 'a b.wav'); // space: paths in the wild contain them
    fs.writeFileSync(file, bytes);
  });

  afterAll(() => {
    stopMediaServer();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the full file', async () => {
    const res = await request(await getMediaUrl(file));
    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toBe('audio/wav');
    expect(res.body).toEqual(bytes);
  });

  it('serves partial content for a seek/resume request', async () => {
    const res = await request(await getMediaUrl(file), { Range: 'bytes=900-' });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 900-999/1000');
    expect(res.body).toEqual(bytes.subarray(900));
  });

  it('answers 416 for an out-of-range request', async () => {
    const res = await request(await getMediaUrl(file), { Range: 'bytes=5000-' });
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */1000');
  });

  it('404s for a missing file and for a wrong token', async () => {
    const missing = await request(await getMediaUrl(path.join(dir, 'nope.wav')));
    expect(missing.status).toBe(404);

    const url = new URL(await getMediaUrl(file));
    const [, , encoded] = url.pathname.split('/');
    const forged = await request(`${url.origin}/not-the-token/${encoded}`);
    expect(forged.status).toBe(404);
  });
});
