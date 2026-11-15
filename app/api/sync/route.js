import * as store from '../../../lib/server/store.js';
import * as auth from '../../../lib/server/auth.js';
import { applyAtomic, filterDb } from '../../../lib/server/access.js';
import { handler, json, readJson, userPayload } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { changes: [{ table, op: 'insert' | 'update' | 'delete', row }] }
// Atomik: jika satu perubahan saja ditolak, tidak ada yang disimpan, dan semua alasan penolakan dikembalikan.
export const POST = handler(async ({ req, me }) => {
    const body = await readJson(req);
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
    const result = applyAtomic(me.account, store.get(), changes);
    if (result.db) store.replace(result.db);
    const db = store.get();
    if (result.applied) await store.save();
    // Akun yang dihapus admin kehilangan sesinya
    const accountIds = new Set(db.accounts.map((a) => a.id));
    for (const c of changes) {
        if (c && c.table === 'accounts' && c.op === 'delete' && c.row && !accountIds.has(c.row.id)) await auth.destroySessionsForAccount(c.row.id);
    }
    const fresh = db.accounts.find((a) => a.id === me.account.id);
    return json(200, {
        applied: result.applied,
        rejected: result.rejected,
        user: fresh ? userPayload(db, fresh) : null,
        db: fresh ? filterDb(fresh, db) : null
    });
}, { auth: true });
