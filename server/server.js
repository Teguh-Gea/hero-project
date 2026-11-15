// Server HERO: tanpa dependensi luar, cukup Node.js 18+.
//   node server/server.js   lalu buka http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./auth');
const access = require('./access');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SHOW_DEMO = process.env.HERO_DEMO !== '0';
const SECURE_COOKIE = process.env.HERO_SECURE_COOKIE === '1';
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const PORTAL_ROLE = { admin: 'admin', astronot: 'astronaut' };

store.load();

function send(res, status, body, headers = {}) {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, {
        'Content-Type': isJson ? MIME['.json'] : headers['Content-Type'] || MIME['.txt'],
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(Object.assign(new Error('Data terlalu besar.'), { status: 413 }));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
            }
            catch {
                reject(Object.assign(new Error('Format JSON tidak valid.'), { status: 400 }));
            }
        });
        req.on('error', reject);
    });
}

function currentAccount(req) {
    const s = auth.sessionFromRequest(req);
    if (!s) return null;
    const account = store.get().accounts.find((a) => a.id === s.accountId);
    return account ? { session: s, account } : null;
}

function userPayload(db, account) {
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

async function handleApi(req, res, url) {
    const db = store.get();
    // Perlindungan CSRF: permintaan yang mengubah data wajib membawa header khusus
    if (req.method !== 'GET' && req.headers['x-hero-request'] !== '1') return send(res, 403, { error: 'Permintaan ditolak.' });

    if (url.pathname === '/api/demo-accounts' && req.method === 'GET') {
        if (!SHOW_DEMO) return send(res, 200, { accounts: [] });
        const role = PORTAL_ROLE[url.searchParams.get('portal')] || 'astronaut';
        return send(res, 200, {
            accounts: db.accounts.filter((a) => a.role === role).map((a) => {
                const astro = a.astronautId ? db.astronauts.find((x) => x.id === a.astronautId) : null;
                const leader = a.astronautId && db.modules.some((m) => m.leaderAstronautId === a.astronautId);
                return { email: a.email, name: astro ? astro.name : a.name, leader };
            }),
            password: 'password123'
        });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown';
        if (!auth.loginAllowed(ip)) return send(res, 429, { error: 'Terlalu banyak percobaan masuk. Coba lagi 10 menit lagi.' });
        const body = await readJson(req);
        const id = String(body.email || '').trim().toLowerCase();
        const portal = PORTAL_ROLE[body.portal] ? body.portal : 'astronot';
        const account = db.accounts.find((a) => a.email.toLowerCase() === id || (a.astronautId || '').toLowerCase() === id);
        if (!account || !auth.verifyPassword(body.password || '', account.passwordHash)) {
            auth.recordLoginFailure(ip);
            return send(res, 401, { error: 'Email/ID atau kata sandi tidak sesuai.' });
        }
        if (account.role !== PORTAL_ROLE[portal]) {
            return send(res, 403, {
                error: account.role === 'admin'
                    ? 'Akun admin masuk lewat portal admin (/admin/).'
                    : 'Akun astronot masuk lewat portal astronot (/astronot/).'
            });
        }
        auth.clearLoginFailures(ip);
        const sid = auth.createSession(account.id);
        return send(res, 200, { user: userPayload(db, account), db: access.filterDb(account, db) }, { 'Set-Cookie': auth.sessionCookie(sid, SECURE_COOKIE) });
    }

    const me = currentAccount(req);
    if (url.pathname === '/api/logout' && req.method === 'POST') {
        if (me) auth.destroySession(me.session.sid);
        return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
    }
    if (!me) return send(res, 401, { error: 'Sesi berakhir. Silakan masuk lagi.' });

    if (url.pathname === '/api/session' && req.method === 'GET') {
        const portal = url.searchParams.get('portal');
        if (portal && PORTAL_ROLE[portal] !== me.account.role) return send(res, 403, { error: 'Akun ini tidak untuk portal ini.' });
        return send(res, 200, { user: userPayload(db, me.account), db: access.filterDb(me.account, db) });
    }
    if (url.pathname === '/api/db' && req.method === 'GET') {
        return send(res, 200, { db: access.filterDb(me.account, db) });
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
        const body = await readJson(req);
        const changes = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
        const result = access.applyChanges(me.account, db, changes);
        if (result.applied) await store.save();
        // Akun yang dihapus admin kehilangan sesinya
        const accountIds = new Set(db.accounts.map((a) => a.id));
        changes.filter((c) => c && c.table === 'accounts' && c.op === 'delete' && !accountIds.has(c.row && c.row.id)).forEach((c) => auth.destroySessionsForAccount(c.row.id));
        const fresh = db.accounts.find((a) => a.id === me.account.id);
        return send(res, 200, { applied: result.applied, rejected: result.rejected, user: fresh ? userPayload(db, fresh) : null, db: fresh ? access.filterDb(fresh, db) : null });
    }
    if (url.pathname === '/api/admin/reset' && req.method === 'POST') {
        if (me.account.role !== 'admin') return send(res, 403, { error: 'Hanya admin yang bisa mereset data.' });
        await store.reset();
        const fresh = store.get().accounts.find((a) => a.email === me.account.email) || store.get().accounts.find((a) => a.role === 'admin');
        const sid = auth.createSession(fresh.id);
        auth.destroySession(me.session.sid);
        return send(res, 200, { user: userPayload(store.get(), fresh), db: access.filterDb(fresh, store.get()) }, { 'Set-Cookie': auth.sessionCookie(sid, SECURE_COOKIE) });
    }
    return send(res, 404, { error: 'Endpoint tidak ditemukan.' });
}

function serveStatic(req, res, url) {
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/admin' || pathname === '/astronot') return send(res, 301, '', { Location: `${pathname}/` });
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Akses ditolak.');
    fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'Halaman tidak ditemukan.');
        const type = MIME[path.extname(file)] || 'application/octet-stream';
        send(res, 200, data, { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'public, max-age=300' });
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
        if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metode tidak diizinkan.');
        return serveStatic(req, res, url);
    }
    catch (err) {
        console.error(err);
        return send(res, err.status || 500, { error: err.status ? err.message : 'Terjadi kesalahan di server.' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`HERO berjalan di http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  Portal admin    : http://localhost:${PORT}/admin/`);
    console.log(`  Portal astronot : http://localhost:${PORT}/astronot/`);
    console.log(`  Database        : ${store.DB_FILE}`);
});
