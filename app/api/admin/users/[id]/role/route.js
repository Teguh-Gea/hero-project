import * as store from '../../../../../../lib/server/store.js';
import * as auth from '../../../../../../lib/server/auth.js';
import { canChangeRole, promoteToAdmin, describeUser } from '../../../../../../lib/server/authz.js';
import { handler, json, readJson } from '../../../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ubah role pengguna: { role: 'admin' }.
// Satu-satunya perubahan yang diizinkan adalah Pemimpin/Anggota Cabin -> Admin (lihat canChangeRole).
// Role Admin terlindungi: permintaan menurunkan Admin selalu ditolak 403.
export const POST = handler(async ({ req, me, params }) => {
    const body = await readJson(req);
    const db = store.get();
    const target = db.accounts.find((a) => a.id === params.id) || null;
    const verdict = canChangeRole(me, target, String(body.role || ''));
    if (!verdict.ok) return json(verdict.status, { error: verdict.reason });
    // Pemeriksaan dan perubahan berjalan sinkron (tanpa await di antaranya), jadi tidak bisa diselipi permintaan lain
    const { releasedCabins } = promoteToAdmin(db, target);
    await store.save();
    // Sesi lama pengguna itu (di portal astronot) diakhiri; ia masuk lagi lewat portal admin
    await auth.destroySessionsForAccount(target.id);
    return json(200, { user: describeUser(target, db, me), releasedCabins });
}, { roles: ['admin'] });
