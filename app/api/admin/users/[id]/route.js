import * as store from '../../../../../lib/server/store.js';
import * as auth from '../../../../../lib/server/auth.js';
import { describeUser } from '../../../../../lib/server/authz.js';
import { applyAtomic } from '../../../../../lib/server/access.js';
import { handler, json, readJson } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Semua aturan (Admin lain terlindungi, role tidak bisa diubah di sini, validasi email & kata sandi)
// diperiksa oleh authorizeChange() di lib/server/access.js, sama seperti /api/sync.
function run(me, change) {
    const result = applyAtomic(me.account, store.get(), [change]);
    if (!result.db) return { error: json(result.rejected[0].status || 403, { error: result.rejected[0].reason }) };
    store.replace(result.db);
    return {};
}

// Ubah akun: { email?, name?, title?, password? }. `role` tidak bisa diubah di sini.
export const PATCH = handler(async ({ req, me, params }) => {
    const body = await readJson(req);
    const row = { id: params.id };
    for (const k of ['email', 'name', 'title', 'password', 'role']) if (body[k] !== undefined) row[k] = body[k];
    const r = run(me, { table: 'accounts', op: 'update', row });
    if (r.error) return r.error;
    await store.save();
    // Kata sandi diganti: sesi lain milik akun itu diakhiri (sesi Admin yang sedang dipakai tetap)
    if (row.password) await auth.destroySessionsForAccount(params.id, params.id === me.account.id ? me.session.sid : null);
    const db = store.get();
    return json(200, { user: describeUser(db.accounts.find((a) => a.id === params.id), db, me) });
}, { roles: ['admin'] });

// Hapus akun Pemimpin/Anggota Cabin. Profil & data kesehatan astronotnya tetap ada.
// Akun Admin (termasuk akun sendiri) tidak bisa dihapus.
export const DELETE = handler(async ({ me, params }) => {
    const r = run(me, { table: 'accounts', op: 'delete', row: { id: params.id } });
    if (r.error) return r.error;
    await store.save();
    await auth.destroySessionsForAccount(params.id);
    return json(200, { ok: true });
}, { roles: ['admin'] });
