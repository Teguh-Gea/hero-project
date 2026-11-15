// Pembantu uji: memanggil Route Handler sungguhan dengan Request buatan dan database sementara.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Database sementara dari data uji tetap (tests/fixtures/seed.json), terpisah dari data demo
export function useTempData({ seed = path.join(process.cwd(), 'tests', 'fixtures', 'seed.json') } = {}) {
    process.env.HERO_SEED_FILE = seed;
    process.env.HERO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-test-'));
    return process.env.HERO_DATA_DIR;
}

export const route = (p) => import(`../app/api/${p}/route.js`);

let ipCounter = 0;
export async function call(mod, method, { cookie, body, params, query = '', csrf = true } = {}) {
    const headers = new Headers({ 'x-forwarded-for': `10.1.0.${++ipCounter % 250}` });
    if (cookie) headers.set('cookie', cookie);
    if (csrf && method !== 'GET') headers.set('x-hero-request', '1');
    if (body !== undefined) headers.set('content-type', 'application/json');
    const req = new Request(`http://localhost/api/x${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const res = await mod[method](req, { params: Promise.resolve(params || {}) });
    let data = null;
    try { data = await res.json(); } catch { /* kosong */ }
    return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

export async function tryLogin(loginRoute, email, password, portal) {
    return call(loginRoute, 'POST', { body: { email, password, portal } });
}

export async function login(loginRoute, email, portal, password = 'password123') {
    const r = await tryLogin(loginRoute, email, password, portal);
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
    return r.setCookie.split(';')[0];
}
