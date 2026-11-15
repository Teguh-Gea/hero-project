// Uji fitur Admin: menunjuk / mengganti Pemimpin Cabin lewat PUT /api/admin/missions/:id/leader.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTempData, dbNow, route, call, login as loginAs } from './helpers.js';

useTempData();
let R, store;
before(async () => {
    R = {
        login: await route('login'), session: await route('session'), sync: await route('sync'),
        leader: await route('admin/missions/[id]/leader'), role: await route('admin/users/[id]/role')
    };
    store = await import('../lib/server/store.js');
});
const login = (email, portal) => loginAs(R.login, email, portal);
const put = (cookie, id, astronautId) => call(R.leader, 'PUT', { cookie, params: { id }, body: { astronautId } });
const appRole = async (cookie) => (await call(R.session, 'GET', { cookie })).data.user.appRole;
const writeCabin = async (cookie, id) => (await call(R.sync, 'POST', {
    cookie, body: { changes: [{ table: 'cabinReadings', op: 'insert', row: { id, moduleId: 'INC-051-N2', date: '2026-11-15', co2: 3 } }] }
})).data.applied;

test('Admin mengganti Pemimpin Cabin; hak akses ikut berpindah', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    const e = await login('elena.rostova@nasa.gov', 'astronot');
    const k = await login('kenji.takahashi@jaxa.jp', 'astronot');
    assert.equal(await appRole(e), 'cabin_leader');
    assert.equal(await appRole(k), 'cabin_member');

    const r = await put(a, 'INC-051', 'AST-0038');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.previous, 'AST-0154');
    assert.equal(r.data.mission.cabin.leaderName, 'Spec. Kenji Takahashi');
    assert.equal((await dbNow()).modules.find((m) => m.id === 'INC-051-N2').leaderAstronautId, 'AST-0038');

    // berlaku langsung, tanpa login ulang
    assert.equal(await appRole(k), 'cabin_leader');
    assert.equal(await appRole(e), 'cabin_member');
    assert.equal(await writeCabin(k, 'CAB-K1'), 1, 'pemimpin baru bisa mengisi data lingkungan');
    assert.equal(await writeCabin(e, 'CAB-E1'), 0, 'pemimpin lama tidak bisa lagi');
});

test('Kabin bisa dikosongkan dari pemimpin', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    const r = await put(a, 'INC-051', null);
    assert.equal(r.status, 200);
    assert.equal(r.data.mission.cabin.leaderAstronautId, null);
    const k = await login('kenji.takahashi@jaxa.jp', 'astronot');
    assert.equal(await appRole(k), 'cabin_member');
    assert.equal(await writeCabin(k, 'CAB-K2'), 0);
});

test('Validasi: hanya kru misi itu dan bukan Admin', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    assert.equal((await put(a, 'INC-051', 'AST-0012')).status, 400, 'Alex bukan kru INC-051');
    assert.equal((await put(a, 'INC-051', 'AST-TIDAK-ADA')).status, 400);
    assert.equal((await put(a, 'INC-404', 'AST-0038')).status, 404);
    // Marcus diangkat jadi Admin, lalu tidak bisa ditunjuk sebagai pemimpin kabin INC-004
    assert.equal((await call(R.role, 'POST', { cookie: a, params: { id: 'ACC-AST-0067' }, body: { role: 'admin' } })).status, 200);
    assert.equal((await put(a, 'INC-004', 'AST-0067')).status, 400);
    assert.equal((await put(a, 'INC-004', 'AST-0012')).status, 200);
});

test('Hanya Admin: Pemimpin & Anggota Cabin ditolak 403, tanpa login 401', async () => {
    const before = JSON.stringify((await dbNow()).modules);
    const k = await login('kenji.takahashi@jaxa.jp', 'astronot');
    const e = await login('elena.rostova@nasa.gov', 'astronot');
    const x = await login('alex.vinson@nasa.gov', 'astronot');
    assert.equal(await appRole(x), 'cabin_leader');
    assert.equal((await put(k, 'INC-051', 'AST-0038')).status, 403, 'anggota menunjuk diri sendiri');
    assert.equal((await put(e, 'INC-051', 'AST-0154')).status, 403, 'mantan pemimpin merebut kembali');
    assert.equal((await put(x, 'INC-004', null)).status, 403, 'pemimpin melepas jabatannya');
    assert.equal((await put(undefined, 'INC-051', 'AST-0038')).status, 401);
    // lewat /api/sync juga ditolak untuk non-Admin
    const mod = (await dbNow()).modules.find((m) => m.id === 'INC-051-N2');
    const r = await call(R.sync, 'POST', { cookie: k, body: { changes: [{ table: 'modules', op: 'update', row: { ...mod, leaderAstronautId: 'AST-0038' } }] } });
    assert.equal(r.data.applied, 0);
    assert.equal(JSON.stringify((await dbNow()).modules), before);
});
