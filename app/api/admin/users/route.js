import * as store from '../../../../lib/server/store.js';
import { describeUser } from '../../../../lib/server/authz.js';
import { handler, json } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar semua pengguna dengan role efektif & cabin (khusus Admin)
export const GET = handler(async ({ me }) => {
    const db = store.get();
    return json(200, { users: db.accounts.map((a) => describeUser(a, db, me)) });
}, { roles: ['admin'] });
