// Autentikasi: hash kata sandi scrypt, sesi acak, cookie HttpOnly.
// Sesi dan batas percobaan login disimpan di Postgres jika DATABASE_URL ada (Vercel: banyak instance
// server), atau di memori proses jika tidak (npm run dev di komputer sendiri).
// ID sesi di database disimpan sebagai hash SHA-256, jadi isi tabel tidak bisa dipakai untuk login.
import crypto from 'node:crypto';
import { usePostgres, q } from './pg.js';

export const SESSION_COOKIE = 'hero_sid';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILURES = 8;

// Mode memori: disimpan di globalThis agar sesi tidak hilang saat hot reload `next dev`
const state = (globalThis.__heroAuth ??= { sessions: new Map(), attempts: new Map() });
const { sessions, attempts } = state;

const hashSid = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex');
const expiry = () => new Date(Date.now() + SESSION_TTL_MS).toISOString();

export function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 32);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const [, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(expected, actual);
}

export async function createSession(accountId) {
    const sid = crypto.randomBytes(32).toString('hex');
    if (usePostgres()) {
        await q('sessionInsert', [hashSid(sid), accountId, expiry()]);
        if (Math.random() < 0.05) await q('sessionPurge');    // sesi kedaluwarsa dibersihkan sesekali
    }
    else sessions.set(hashSid(sid), { accountId, expiresAt: Date.now() + SESSION_TTL_MS });
    return sid;
}

function parseCookies(req) {
    const out = {};
    String(req.headers.get('cookie') || '').split(';').forEach((part) => {
        const i = part.indexOf('=');
        if (i > 0) {
            try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
            catch { /* cookie rusak diabaikan */ }
        }
    });
    return out;
}

export function sessionIdFromRequest(req) {
    return parseCookies(req)[SESSION_COOKIE] || null;
}

// Sesi yang masih berlaku untuk ID ini (diperpanjang setiap kali dipakai), atau null
export async function sessionById(sid) {
    if (!sid || typeof sid !== 'string' || sid.length > 128) return null;
    if (usePostgres()) {
        const rows = await q('sessionTouch', [hashSid(sid), expiry()]);
        return rows.length ? { sid, accountId: rows[0].account_id } : null;
    }
    const key = hashSid(sid);
    const s = sessions.get(key);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
        sessions.delete(key);
        return null;
    }
    s.expiresAt = Date.now() + SESSION_TTL_MS;
    return { sid, accountId: s.accountId };
}

export function sessionFromRequest(req) {
    return sessionById(sessionIdFromRequest(req));
}

export async function destroySession(sid) {
    if (!sid) return;
    if (usePostgres()) await q('sessionDelete', [hashSid(sid)]);
    else sessions.delete(hashSid(sid));
}

// Akhiri semua sesi milik akun ini, kecuali `keepSid` (mis. sesi yang sedang dipakai)
export async function destroySessionsForAccount(accountId, keepSid = null) {
    const keep = keepSid ? hashSid(keepSid) : '';
    if (usePostgres()) {
        await q('sessionDeleteAccount', [accountId, keep]);
        return;
    }
    for (const [key, s] of sessions) if (s.accountId === accountId && key !== keep) sessions.delete(key);
}

export function sessionCookie(sid, secure) {
    const parts = [`${SESSION_COOKIE}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`];
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

export function clearCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// Batasi percobaan login: 8 kali gagal per 10 menit per alamat IP
export async function loginAllowed(ip) {
    if (usePostgres()) {
        const rows = await q('attemptGet', [ip]);
        return !rows.length || Number(rows[0].count) < MAX_FAILURES;
    }
    const a = attempts.get(ip);
    if (!a || a.resetAt < Date.now()) return true;
    return a.count < MAX_FAILURES;
}
export async function recordLoginFailure(ip) {
    if (usePostgres()) {
        await q('attemptFail', [ip]);
        return;
    }
    const a = attempts.get(ip);
    if (!a || a.resetAt < Date.now()) attempts.set(ip, { count: 1, resetAt: Date.now() + 10 * 60 * 1000 });
    else a.count++;
}
export async function clearLoginFailures(ip) {
    if (usePostgres()) await q('attemptClear', [ip]);
    else attempts.delete(ip);
}
