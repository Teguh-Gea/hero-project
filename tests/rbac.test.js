// Uji otorisasi HERO: memanggil Route Handler sungguhan dengan Request buatan.
// Jalankan: npm test   (tanpa dependensi tambahan, cukup Node 20.9+)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useTempData, dbNow } from './helpers.js';

useTempData();

let R, authz, store;
before(async () => {
    const load = (p) => import(`../app/api/${p}/route.js`);
    R = {
        login: await load('login'), logout: await load('logout'), session: await load('session'), db: await load('db'),
        sync: await load('sync'), reset: await load('admin/reset'), users: await load('admin/users'), role: await load('admin/users/[id]/role')
    };
    authz = await import('../lib/server/authz.js');
    store = await import('../lib/server/store.js');
});

let ipCounter = 0;
async function call(mod, method, { cookie, body, params, query = '', csrf = true } = {}) {
    const headers = new Headers({ 'x-forwarded-for': `10.0.0.${++ipCounter % 250}` });
    if (cookie) headers.set('cookie', cookie);
    if (csrf && method !== 'GET') headers.set('x-hero-request', '1');
    if (body !== undefined) headers.set('content-type', 'application/json');
    const req = new Request(`http://localhost/api/x${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const res = await mod[method](req, { params: Promise.resolve(params || {}) });
    let data = null;
    try { data = await res.json(); } catch { /* kosong */ }
    return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}
async function login(email, portal) {
    const r = await call(R.login, 'POST', { body: { email, password: 'password123', portal } });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
    return r.setCookie.split(';')[0];
}
const sync = (cookie, ...changes) => call(R.sync, 'POST', { cookie, body: { changes } });
const sid = (cookie) => cookie.split('=')[1];
const reading = (id, moduleId) => ({ id, moduleId, assignmentId: null, day: 150, co2: 3.1 });

const ADMIN = 'admin@nasa.gov', ADMIN2 = 'admin2@nasa.gov';
const ALEX = 'alex.vinson@nasa.gov', MARCUS = 'marcus.vance@nasa.gov', ELENA = 'elena.rostova@nasa.gov', KENJI = 'kenji.takahashi@jaxa.jp';

// ---------------------------------------------------------------- Authentication
test('belum login: API protected menolak 401', async () => {
    assert.equal((await call(R.session, 'GET')).status, 401);
    assert.equal((await call(R.db, 'GET')).status, 401);
    assert.equal((await call(R.users, 'GET')).status, 401);
    assert.equal((await sync(undefined, { table: 'cabinReadings', op: 'insert', row: reading('X', 'INC-051-N2') })).status, 401);
    assert.equal((await call(R.role, 'POST', { body: { role: 'admin' }, params: { id: 'ACC-AST-0067' } })).status, 401);
    assert.equal((await call(R.db, 'GET', { cookie: 'hero_sid=palsu' })).status, 401, 'cookie palsu');
});

test('belum login: halaman portal dialihkan ke halaman login', async () => {
    assert.equal(await authz.portalRedirect(null, 'admin', 'app'), '/admin/login');
    assert.equal(await authz.portalRedirect('palsu', 'astronot', 'app'), '/astronot/login');
    assert.equal(await authz.portalRedirect(null, 'admin', 'login'), null);
});

test('sudah login: hanya portal sesuai role; salah portal dialihkan', async () => {
    const a = await login(ADMIN, 'admin');
    const k = await login(KENJI, 'astronot');
    assert.equal(await authz.portalRedirect(sid(a), 'admin', 'app'), null);
    assert.equal(await authz.portalRedirect(sid(a), 'astronot', 'app'), '/admin');
    assert.equal(await authz.portalRedirect(sid(a), 'admin', 'login'), '/admin');
    assert.equal(await authz.portalRedirect(sid(k), 'astronot', 'app'), null);
    assert.equal(await authz.portalRedirect(sid(k), 'admin', 'app'), '/astronot');
    assert.equal((await call(R.session, 'GET', { cookie: k, query: '?portal=admin' })).status, 403);
    assert.equal((await call(R.login, 'POST', { body: { email: ADMIN, password: 'password123', portal: 'astronot' } })).status, 403);
});

test('logout mengakhiri sesi', async () => {
    const k = await login(KENJI, 'astronot');
    assert.equal((await call(R.logout, 'POST', { cookie: k })).status, 200);
    assert.equal((await call(R.db, 'GET', { cookie: k })).status, 401);
});

test('permintaan tanpa header CSRF ditolak', async () => {
    const a = await login(ADMIN, 'admin');
    assert.equal((await call(R.role, 'POST', { cookie: a, body: { role: 'admin' }, params: { id: 'ACC-AST-0067' }, csrf: false })).status, 403);
    assert.equal((await dbNow()).accounts.find((x) => x.id === 'ACC-AST-0067').role, 'astronaut');
});

// ---------------------------------------------------------------- Anggota Cabin (Kenji, INC-051-N2)
test('Anggota: melihat diri & rekan sekabin saja', async () => {
    const k = await login(KENJI, 'astronot');
    const { data } = await call(R.db, 'GET', { cookie: k });
    assert.deepEqual(data.db.astronauts.map((a) => a.id).sort(), ['AST-0038', 'AST-0154']);
    assert.ok(data.db.cabinReadings.every((r) => r.moduleId === 'INC-051-N2'));
    assert.ok(data.db.assignments.every((a) => a.quartersModuleId === 'INC-051-N2'));
    assert.ok(data.db.accounts.every((a) => !('passwordHash' in a)), 'tidak ada hash kata sandi');
    const s = await call(R.session, 'GET', { cookie: k });
    assert.equal(s.data.user.appRole, 'cabin_member');
});

test('Anggota: tidak bisa input/ubah data lingkungan cabin', async () => {
    const k = await login(KENJI, 'astronot');
    const r = await sync(k, { table: 'cabinReadings', op: 'insert', row: reading('CAB-K1', 'INC-051-N2') });
    assert.equal(r.data.applied, 0);
    const existing = (await dbNow()).cabinReadings.find((x) => x.moduleId === 'INC-051-N2');
    const u = await sync(k, { table: 'cabinReadings', op: 'update', row: { ...existing, co2: 9 } });
    assert.equal(u.data.applied, 0);
});

test('Anggota: boleh input data kesehatan sendiri, tidak untuk rekan atau cabin lain', async () => {
    const k = await login(KENJI, 'astronot');
    const own = { id: 'VIT-K1', assignmentId: 'ASG-AST-0038-INC-051', day: 150, hr: 60 };
    assert.equal((await sync(k, { table: 'vitalSigns', op: 'insert', row: own })).data.applied, 1);
    const mate = { id: 'VIT-K2', assignmentId: 'ASG-AST-0154-INC-051', day: 150, hr: 60 };
    assert.equal((await sync(k, { table: 'vitalSigns', op: 'insert', row: mate })).data.applied, 0);
    const other = { id: 'VIT-K3', assignmentId: 'ASG-AST-0012-INC-004', day: 150, hr: 60 };
    assert.equal((await sync(k, { table: 'vitalSigns', op: 'insert', row: other })).data.applied, 0);
    // IDOR: mengubah profil astronot cabin lain dengan ID langsung
    const alex = (await dbNow()).astronauts.find((a) => a.id === 'AST-0012');
    assert.equal((await sync(k, { table: 'astronauts', op: 'update', row: { ...alex, weightKg: 1 } })).data.applied, 0);
});

test('Anggota: tidak bisa mengubah role, menunjuk diri sebagai pemimpin, atau akses fitur Admin', async () => {
    const k = await login(KENJI, 'astronot');
    const me = (await dbNow()).accounts.find((a) => a.email === KENJI);
    assert.equal((await sync(k, { table: 'accounts', op: 'update', row: { ...me, role: 'admin' } })).data.applied, 0);
    assert.equal((await call(R.role, 'POST', { cookie: k, body: { role: 'admin' }, params: { id: me.id } })).status, 403);
    assert.equal((await call(R.role, 'POST', { cookie: k, body: { role: 'cabin_leader' }, params: { id: me.id } })).status, 403);
    const mod = (await dbNow()).modules.find((m) => m.id === 'INC-051-N2');
    assert.equal((await sync(k, { table: 'modules', op: 'update', row: { ...mod, leaderAstronautId: 'AST-0038' } })).data.applied, 0);
    assert.equal((await call(R.users, 'GET', { cookie: k })).status, 403);
    assert.equal((await call(R.reset, 'POST', { cookie: k })).status, 403);
    assert.equal((await dbNow()).accounts.find((a) => a.email === KENJI).role, 'astronaut');
    assert.equal((await dbNow()).modules.find((m) => m.id === 'INC-051-N2').leaderAstronautId, 'AST-0154');
});

// ---------------------------------------------------------------- Pemimpin Cabin (Elena, INC-051-N2)
test('Pemimpin: input & ubah data lingkungan cabin sendiri', async () => {
    const e = await login(ELENA, 'astronot');
    const s = await call(R.session, 'GET', { cookie: e });
    assert.equal(s.data.user.appRole, 'cabin_leader');
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'insert', row: reading('CAB-E1', 'INC-051-N2') })).data.applied, 1);
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'update', row: { ...reading('CAB-E1', 'INC-051-N2'), co2: 2.5 } })).data.applied, 1);
});

test('Pemimpin: tidak bisa menyentuh cabin lain (cabinId dari client tidak dipercaya)', async () => {
    const e = await login(ELENA, 'astronot');
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'insert', row: reading('CAB-E2', 'INC-004-N2') })).data.applied, 0);
    // memindahkan bacaan miliknya ke cabin lain
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'update', row: reading('CAB-E1', 'INC-004-N2') })).data.applied, 0);
    // mengubah/menghapus bacaan cabin lain dengan ID langsung, dengan moduleId dipalsukan
    const foreign = (await dbNow()).cabinReadings.find((x) => x.moduleId === 'INC-004-N2');
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'update', row: { ...foreign, moduleId: 'INC-051-N2' } })).data.applied, 0);
    assert.equal((await sync(e, { table: 'cabinReadings', op: 'delete', row: { id: foreign.id, moduleId: 'INC-051-N2' } })).data.applied, 0);
    assert.ok((await dbNow()).cabinReadings.some((x) => x.id === foreign.id && x.moduleId === 'INC-004-N2'));
    const { data } = await call(R.db, 'GET', { cookie: e });
    assert.ok(!data.db.astronauts.some((a) => a.id === 'AST-0012' || a.id === 'AST-0067'), 'kru cabin lain tidak terlihat');
    assert.ok(data.db.cabinReadings.every((r) => r.moduleId === 'INC-051-N2'));
});

test('Pemimpin: tidak bisa mengubah role atau akses fitur Admin', async () => {
    const e = await login(ELENA, 'astronot');
    assert.equal((await call(R.role, 'POST', { cookie: e, body: { role: 'admin' }, params: { id: 'ACC-AST-0038' } })).status, 403);
    assert.equal((await call(R.role, 'POST', { cookie: e, body: { role: 'admin' }, params: { id: 'ACC-AST-0154' } })).status, 403);
    assert.equal((await call(R.users, 'GET', { cookie: e })).status, 403);
    assert.equal((await call(R.reset, 'POST', { cookie: e })).status, 403);
    const iv = { id: 'INT-E1', assignmentId: 'ASG-AST-0154-INC-051', type: 'lbnp', status: 'approved' };
    assert.equal((await sync(e, { table: 'interventions', op: 'insert', row: iv })).data.applied, 0, 'persetujuan protokol khusus Admin');
});

// ---------------------------------------------------------------- Admin
test('Multiple Admin: dua Admin login dan bekerja bersamaan', async () => {
    const a1 = await login(ADMIN, 'admin');
    const a2 = await login(ADMIN2, 'admin');
    const [d1, d2] = await Promise.all([call(R.db, 'GET', { cookie: a1 }), call(R.db, 'GET', { cookie: a2 })]);
    assert.equal(d1.status, 200);
    assert.equal(d2.status, 200);
    assert.equal(d1.data.db.astronauts.length, (await dbNow()).astronauts.length);
    const { data } = await call(R.users, 'GET', { cookie: a1 });
    assert.equal(data.users.filter((u) => u.role === 'admin').length, 2);
    assert.ok(data.users.every((u) => !('passwordHash' in u)));
});

test('Admin: mengelola data lingkungan semua cabin', async () => {
    const a = await login(ADMIN, 'admin');
    const r = await sync(a,
        { table: 'cabinReadings', op: 'insert', row: reading('CAB-A1', 'INC-004-N2') },
        { table: 'cabinReadings', op: 'insert', row: reading('CAB-A2', 'INC-051-N2') });
    assert.equal(r.data.applied, 2);
});

test('Admin: tidak bisa menurunkan Admin lain (API role)', async () => {
    const a2 = await login(ADMIN2, 'admin');
    for (const role of ['cabin_leader', 'cabin_member', 'astronaut', 'superuser', '']) {
        const r = await call(R.role, 'POST', { cookie: a2, body: { role }, params: { id: 'ACC-ADMIN-01' } });
        assert.equal(r.status, 403, `role ${role}`);
    }
    assert.equal((await call(R.role, 'POST', { cookie: a2, body: { role: 'admin' }, params: { id: 'ACC-ADMIN-01' } })).status, 409);
    assert.equal((await call(R.role, 'POST', { cookie: a2, body: { role: 'cabin_member' }, params: { id: 'ACC-ADMIN-02' } })).status, 403, 'diri sendiri');
    assert.equal((await dbNow()).accounts.find((a) => a.id === 'ACC-ADMIN-01').role, 'admin');
});

test('Admin: tidak bisa menurunkan, menghapus, atau mengambil alih Admin lain lewat /api/sync', async () => {
    const a2 = await login(ADMIN2, 'admin');
    const a1row = { ...(await dbNow()).accounts.find((a) => a.id === 'ACC-ADMIN-01') };
    delete a1row.passwordHash;
    const tries = [
        { table: 'accounts', op: 'update', row: { ...a1row, role: 'astronaut' } },
        { table: 'accounts', op: 'update', row: { ...a1row, password: 'diambilalih123' } },
        { table: 'accounts', op: 'update', row: { ...a1row, email: 'pencuri@x.com' } },
        { table: 'accounts', op: 'delete', row: { id: 'ACC-ADMIN-01' } }
    ];
    for (const c of tries) assert.equal((await sync(a2, c)).data.applied, 0, `${c.op} ${JSON.stringify(c.row).slice(0, 60)}`);
    const a1 = (await dbNow()).accounts.find((a) => a.id === 'ACC-ADMIN-01');
    assert.equal(a1.role, 'admin');
    assert.equal(a1.email, ADMIN);
    await login(ADMIN, 'admin'); // kata sandi lama tetap berlaku
    // Admin tetap bisa mengubah akunnya sendiri (selain role)
    const own = { ...(await dbNow()).accounts.find((a) => a.id === 'ACC-ADMIN-02') };
    delete own.passwordHash;
    assert.equal((await sync(a2, { table: 'accounts', op: 'update', row: { ...own, title: 'Flight Surgeon' } })).data.applied, 1);
    assert.equal((await sync(a2, { table: 'accounts', op: 'update', row: { ...own, role: 'astronaut' } })).data.applied, 0);
});

test('Admin: Pemimpin <-> Anggota bukan lewat ubah role', async () => {
    const a = await login(ADMIN, 'admin');
    assert.equal((await call(R.role, 'POST', { cookie: a, body: { role: 'cabin_leader' }, params: { id: 'ACC-AST-0067' } })).status, 403);
    assert.equal((await call(R.role, 'POST', { cookie: a, body: { role: 'cabin_member' }, params: { id: 'ACC-AST-0012' } })).status, 403);
    assert.equal((await call(R.role, 'POST', { cookie: a, body: { role: 'admin' }, params: { id: 'ACC-TIDAK-ADA' } })).status, 404);
});

test('Admin: mengangkat Anggota Cabin menjadi Admin', async () => {
    const a = await login(ADMIN, 'admin');
    const m = await login(MARCUS, 'astronot');
    const r = await call(R.role, 'POST', { cookie: a, body: { role: 'admin' }, params: { id: 'ACC-AST-0067' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'admin');
    assert.equal(r.data.user.protected, true);
    assert.equal((await dbNow()).accounts.find((x) => x.id === 'ACC-AST-0067').role, 'admin');
    assert.ok((await dbNow()).astronauts.some((x) => x.id === 'AST-0067'), 'profil & data kesehatan tetap ada');
    assert.equal((await call(R.db, 'GET', { cookie: m })).status, 401, 'sesi lama diakhiri');
    assert.equal((await call(R.login, 'POST', { body: { email: MARCUS, password: 'password123', portal: 'astronot' } })).status, 403);
    const m2 = await login(MARCUS, 'admin');
    assert.equal((await call(R.users, 'GET', { cookie: m2 })).status, 200, 'Admin baru punya hak penuh');
    // persisten di file database
    const onDisk = process.env.HERO_TEST_PG === '1'
        ? globalThis.__heroFakePg.db.state.data
        : JSON.parse(fs.readFileSync(path.join(process.env.HERO_DATA_DIR, 'hero-db.json'), 'utf8'));
    assert.equal(onDisk.accounts.find((x) => x.id === 'ACC-AST-0067').role, 'admin');
});

test('Admin: mengangkat Pemimpin Cabin menjadi Admin melepas kepemimpinannya', async () => {
    const a = await login(ADMIN2, 'admin');
    const r = await call(R.role, 'POST', { cookie: a, body: { role: 'admin' }, params: { id: 'ACC-AST-0012' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.releasedCabins.sort(), ['INC-001-N2', 'INC-004-N2']);
    assert.ok((await dbNow()).modules.filter((x) => x.id !== 'INC-051-N2').every((x) => x.leaderAstronautId === null));
    // Admin yang baru diangkat juga terlindungi dari Admin lain
    const m = await login(MARCUS, 'admin');
    assert.equal((await call(R.role, 'POST', { cookie: m, body: { role: 'cabin_leader' }, params: { id: 'ACC-AST-0012' } })).status, 403);
    // dan tidak bisa ditunjuk lagi sebagai pemimpin cabin
    const mod = (await dbNow()).modules.find((x) => x.id === 'INC-004-N2');
    assert.equal((await sync(a, { table: 'modules', op: 'update', row: { ...mod, leaderAstronautId: 'AST-0012' } })).data.applied, 0);
});

test('Penunjukan Pemimpin Cabin oleh Admin tetap lewat penugasan cabin', async () => {
    const a = await login(ADMIN, 'admin');
    assert.equal((await sync(a, { table: 'assignments', op: 'insert', row: { id: 'ASG-T-1', astronautId: 'AST-0038', missionId: 'INC-004', launchDate: '2026-06-23', plannedDays: 180 } })).data.applied, 1);
    const mod = (await dbNow()).modules.find((x) => x.id === 'INC-004-N2');
    assert.equal((await sync(a, { table: 'modules', op: 'update', row: { ...mod, leaderAstronautId: 'AST-0038' } })).data.applied, 1);
    const k = await login(KENJI, 'astronot');
    assert.equal((await call(R.session, 'GET', { cookie: k })).data.user.appRole, 'cabin_leader');
    assert.equal((await sync(k, { table: 'cabinReadings', op: 'insert', row: reading('CAB-K9', 'INC-004-N2') })).data.applied, 1);
});
