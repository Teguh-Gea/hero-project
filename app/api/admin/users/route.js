import crypto from 'node:crypto';
import * as store from '../../../../lib/server/store.js';
import { describeUser } from '../../../../lib/server/authz.js';
import { applyAtomic } from '../../../../lib/server/access.js';
import { handler, json, readJson } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar semua pengguna dengan role efektif & cabin (khusus Admin)
export const GET = handler(async ({ me }) => {
    const db = store.get();
    const astronautsWithoutAccount = db.astronauts
        .filter((a) => !db.accounts.some((acc) => acc.astronautId === a.id))
        .map((a) => ({ id: a.id, name: a.name }));
    return json(200, { users: db.accounts.map((a) => describeUser(a, db, me)), astronautsWithoutAccount });
}, { roles: ['admin'] });

// Buat akun baru.
//   { kind: 'admin', email, password, name, title? }          -> akun Admin baru (tanpa profil astronot)
//   { kind: 'astronaut', astronautId, email, password }       -> akun untuk astronot yang belum punya akun
// Aturan email, kata sandi, dan keunikan sama dengan /api/sync (lib/server/access.js).
export const POST = handler(async ({ req, me }) => {
    const body = await readJson(req);
    const db = store.get();
    const kind = body.kind === 'admin' ? 'admin' : body.kind === 'astronaut' ? 'astronaut' : null;
    if (!kind) return json(400, { error: 'Jenis akun harus admin atau astronaut.' });
    const astro = kind === 'astronaut' ? db.astronauts.find((a) => a.id === body.astronautId) : null;
    if (kind === 'astronaut' && !astro) return json(400, { error: 'Pilih astronot yang belum punya akun.' });
    const id = kind === 'admin' ? `ACC-ADMIN-${crypto.randomBytes(4).toString('hex').toUpperCase()}` : `ACC-${astro.id}`;
    const row = {
        id,
        role: kind,
        email: body.email,
        password: body.password,
        astronautId: astro ? astro.id : null,
        name: astro ? astro.name : String(body.name || '').trim(),
        title: kind === 'admin' ? String(body.title || '').trim() || 'Admin' : null
    };
    if (kind === 'admin' && !row.name) return json(400, { error: 'Nama Admin wajib diisi.' });
    const result = applyAtomic(me.account, db, [{ table: 'accounts', op: 'insert', row }]);
    if (!result.db) return json(result.rejected[0].status || 400, { error: result.rejected[0].reason });
    store.replace(result.db);
    await store.save();
    const created = store.get().accounts.find((a) => a.id === id);
    return json(201, { user: describeUser(created, store.get(), me) });
}, { roles: ['admin'] });
