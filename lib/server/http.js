// Pembantu bersama untuk Route Handler API (app/api/**/route.js).
import { getCurrentUser, requireRole, effectiveRole, permissionsFor, ROLE_LABELS } from './authz.js';
import * as store from './store.js';

export const SHOW_DEMO = process.env.HERO_DEMO !== '0';
// Cookie sesi bertanda Secure (HTTPS saja). Otomatis aktif di Vercel; HERO_SECURE_COOKIE=0 untuk mematikan.
export const SECURE_COOKIE = process.env.HERO_SECURE_COOKIE === '1' || (!!process.env.VERCEL && process.env.HERO_SECURE_COOKIE !== '0');
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

// Isi permintaan dibaca sekali lalu disimpan, karena handler bisa diulang saat terjadi konflik penulisan
const bodies = new WeakMap();
async function bodyText(req) {
    if (!bodies.has(req)) bodies.set(req, req.text());
    return bodies.get(req);
}

export async function readJson(req) {
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw httpError(413, 'Data terlalu besar.');
    const text = await bodyText(req);
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
        leaderOfModules: leaderOf,
        // Role efektif & hak akses hanya untuk tampilan (UI). Server tetap memeriksa ulang setiap permintaan.
        appRole: effectiveRole(account, db),
        roleLabel: ROLE_LABELS[effectiveRole(account, db)],
        permissions: permissionsFor(effectiveRole(account, db))
    };
}

// Membungkus handler: memuat data, cek CSRF, sesi, role, dan mengubah error menjadi respons JSON.
//   options.auth = true          -> 401 jika belum masuk
//   options.roles = ['admin']    -> 403 jika role efektif tidak termasuk (otomatis butuh auth)
// Handler menerima { req, me, url, params }. `me` = getCurrentUser(): { session, account, role, scope }.
// Di Postgres, jika data diubah permintaan lain saat handler berjalan (ConflictError), seluruh handler
// diulang dengan data terbaru (maksimal 3 kali), jadi pemeriksaan hak akses selalu memakai data terkini.
const MAX_ATTEMPTS = 3;

export function handler(fn, options = {}) {
    return async (req, ctx) => store.withRequestDb(async () => {
        for (let attempt = 1; ; attempt++) {
            try {
                // Perlindungan CSRF: permintaan yang mengubah data wajib membawa header khusus
                if (req.method !== 'GET' && req.headers.get('x-hero-request') !== '1') return json(403, { error: 'Permintaan ditolak.' });
                await store.load();
                const me = await getCurrentUser(req);
                if ((options.auth || options.roles) && !me) return json(401, { error: 'Sesi berakhir. Silakan masuk lagi.' });
                if (options.roles) requireRole(me, ...options.roles);
                const params = ctx && ctx.params ? await ctx.params : {};
                return await fn({ req, me, url: new URL(req.url), params });
            }
            catch (err) {
                if (err.retry && attempt < MAX_ATTEMPTS) continue;
                if (!err.status) console.error(err);
                return json(err.status || 500, { error: err.status ? err.message : 'Terjadi kesalahan di server.' });
            }
        }
    });
}
