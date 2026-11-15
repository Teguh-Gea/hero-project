// Autentikasi: hash kata sandi scrypt, sesi acak di memori, cookie HttpOnly.
'use strict';
const crypto = require('crypto');

const SESSION_COOKIE = 'hero_sid';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 32);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
    const [, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(expected, actual);
}

function createSession(accountId) {
    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, { accountId, expiresAt: Date.now() + SESSION_TTL_MS });
    return sid;
}

function parseCookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach((part) => {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}

function sessionFromRequest(req) {
    const sid = parseCookies(req)[SESSION_COOKIE];
    if (!sid) return null;
    const s = sessions.get(sid);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
        sessions.delete(sid);
        return null;
    }
    s.expiresAt = Date.now() + SESSION_TTL_MS;
    return { sid, ...s };
}

function destroySession(sid) {
    sessions.delete(sid);
}

function destroySessionsForAccount(accountId) {
    for (const [sid, s] of sessions) if (s.accountId === accountId) sessions.delete(sid);
}

function sessionCookie(sid, secure) {
    const parts = [`${SESSION_COOKIE}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`];
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

function clearCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// Batasi percobaan login: 8 kali gagal per 10 menit per alamat IP
const attempts = new Map();
function loginAllowed(ip) {
    const a = attempts.get(ip);
    if (!a || a.resetAt < Date.now()) return true;
    return a.count < 8;
}
function recordLoginFailure(ip) {
    const a = attempts.get(ip);
    if (!a || a.resetAt < Date.now()) attempts.set(ip, { count: 1, resetAt: Date.now() + 10 * 60 * 1000 });
    else a.count++;
}
function clearLoginFailures(ip) {
    attempts.delete(ip);
}

module.exports = {
    hashPassword, verifyPassword, createSession, sessionFromRequest, destroySession, destroySessionsForAccount,
    sessionCookie, clearCookie, loginAllowed, recordLoginFailure, clearLoginFailures
};
