import * as store from '../../../lib/server/store.js';
import * as auth from '../../../lib/server/auth.js';
import { filterDb } from '../../../lib/server/access.js';
import { handler, json, readJson, clientIp, userPayload, PORTAL_ROLE, SECURE_COOKIE } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { email, password, portal }
export const POST = handler(async ({ req }) => {
    const db = store.get();
    const ip = clientIp(req);
    if (!auth.loginAllowed(ip)) return json(429, { error: 'Terlalu banyak percobaan masuk. Coba lagi 10 menit lagi.' });
    const body = await readJson(req);
    const id = String(body.email || '').trim().toLowerCase();
    const portal = PORTAL_ROLE[body.portal] ? body.portal : 'astronot';
    const account = db.accounts.find((a) => a.email.toLowerCase() === id || (a.astronautId || '').toLowerCase() === id);
    if (!account || !auth.verifyPassword(body.password || '', account.passwordHash)) {
        auth.recordLoginFailure(ip);
        return json(401, { error: 'Email/ID atau kata sandi tidak sesuai.' });
    }
    if (account.role !== PORTAL_ROLE[portal]) {
        return json(403, {
            error: account.role === 'admin'
                ? 'Akun admin masuk lewat portal admin (/admin).'
                : 'Akun astronot masuk lewat portal astronot (/astronot).'
        });
    }
    auth.clearLoginFailures(ip);
    const sid = auth.createSession(account.id);
    return json(200, { user: userPayload(db, account), db: filterDb(account, db) }, { 'Set-Cookie': auth.sessionCookie(sid, SECURE_COOKIE) });
});
