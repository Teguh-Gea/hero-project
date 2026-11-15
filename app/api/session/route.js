import * as store from '../../../lib/server/store.js';
import { filterDb } from '../../../lib/server/access.js';
import { handler, json, userPayload, PORTAL_ROLE } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pengguna aktif + data yang boleh dilihat
export const GET = handler(async ({ me, url }) => {
    const db = store.get();
    const portal = url.searchParams.get('portal');
    if (portal && PORTAL_ROLE[portal] !== me.account.role) return json(403, { error: 'Akun ini tidak untuk portal ini.' });
    return json(200, { user: userPayload(db, me.account), db: filterDb(me.account, db) });
}, { auth: true });
