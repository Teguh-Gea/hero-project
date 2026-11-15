// Pembantu bersama untuk Route Handler API (app/api/**/route.js).
import * as store from './store.js';
import * as auth from './auth.js';

export const SHOW_DEMO = process.env.HERO_DEMO !== '0';
export const SECURE_COOKIE = process.env.HERO_SECURE_COOKIE === '1';
export const PORTAL_ROLE = { admin: 'admin', astronot: 'astronaut' };
const MAX_BODY = 2 * 1024 * 1024;

export function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

export function json(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
    });
}

export async function readJson(req) {
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw httpError(413, 'Data terlalu besar.');
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY) throw httpError(413, 'Data terlalu besar.');
    if (!text) return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw httpError(400, 'Format JSON tidak valid.');
    }
}

// Alamat klien untuk batas percobaan login. Next.js tidak membuka socket ke Route Handler,
// jadi dipakai X-Forwarded-For. Entri paling kanan adalah hop terdekat (proxy Anda),
// yang lebih sulit dipalsukan klien daripada entri paling kiri.
export function clientIp(req) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
        const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length) return parts[parts.length - 1];
    }
    return req.headers.get('x-real-ip') || 'unknown';
}

export function currentAccount(req) {
    const s = auth.sessionFromRequest(req);
    if (!s) return null;
    const account = store.get().accounts.find((a) => a.id === s.accountId);
    return account ? { session: s, account } : null;
}

export function userPayload(db, account) {
    const astro = account.astronautId ? db.astronauts.find((a) => a.id === account.astronautId) : null;
    const leaderOf = account.astronautId ? db.modules.filter((m) => m.leaderAstronautId === account.astronautId).map((m) => m.id) : [];
    return {
        id: account.astronautId || account.id,
        accountId: account.id,
        email: account.email,
        role: account.role,
        title: account.title || null,
        name: astro ? astro.name : account.name,
        astronautId: account.astronautId || null,
        leaderOfModules: leaderOf
    };
}

// Membungkus handler: cek CSRF untuk permintaan yang mengubah data, sesi (jika diminta),
// dan mengubah error menjadi respons JSON.
//   options.auth = true  -> handler menerima { req, me } dan 401 jika belum masuk
export function handler(fn, options = {}) {
    return async (req) => {
        try {
            // Perlindungan CSRF: permintaan yang mengubah data wajib membawa header khusus
            if (req.method !== 'GET' && req.headers.get('x-hero-request') !== '1') return json(403, { error: 'Permintaan ditolak.' });
            const me = currentAccount(req);
            if (options.auth && !me) return json(401, { error: 'Sesi berakhir. Silakan masuk lagi.' });
            return await fn({ req, me, url: new URL(req.url) });
        }
        catch (err) {
            if (!err.status) console.error(err);
            return json(err.status || 500, { error: err.status ? err.message : 'Terjadi kesalahan di server.' });
        }
    };
}
