import * as store from '../../../../lib/server/store.js';
import * as auth from '../../../../lib/server/auth.js';
import { filterDb } from '../../../../lib/server/access.js';
import { handler, json, userPayload, SECURE_COOKIE } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reset ke data contoh (khusus admin)
export const POST = handler(async ({ me }) => {
    await store.reset();
    const db = store.get();
    const fresh = db.accounts.find((a) => a.email === me.account.email) || db.accounts.find((a) => a.role === 'admin');
    const sid = auth.createSession(fresh.id);
    auth.destroySession(me.session.sid);
    return json(200, { user: userPayload(db, fresh), db: filterDb(fresh, db) }, { 'Set-Cookie': auth.sessionCookie(sid, SECURE_COOKIE) });
}, { roles: ['admin'] });
