import * as store from '../../../lib/server/store.js';
import * as auth from '../../../lib/server/auth.js';
import { applyChanges, filterDb } from '../../../lib/server/access.js';
import { handler, json, readJson, userPayload } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { changes: [{ table, op: 'insert' | 'update' | 'delete', row }] }
// Perubahan yang tidak diizinkan ditolak satu per satu dengan alasannya.
export const POST = handler(async ({ req, me }) => {
    const db = store.get();
    const body = await readJson(req);
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
    const result = applyChanges(me.account, db, changes);
    if (result.applied) await store.save();
    // Akun yang dihapus admin kehilangan sesinya
    const accountIds = new Set(db.accounts.map((a) => a.id));
    changes
        .filter((c) => c && c.table === 'accounts' && c.op === 'delete' && !accountIds.has(c.row && c.row.id))
        .forEach((c) => auth.destroySessionsForAccount(c.row.id));
    const fresh = db.accounts.find((a) => a.id === me.account.id);
    return json(200, {
        applied: result.applied,
        rejected: result.rejected,
        user: fresh ? userPayload(db, fresh) : null,
        db: fresh ? filterDb(fresh, db) : null
    });
}, { auth: true });
