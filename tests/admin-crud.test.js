// Uji fitur Admin: CRUD akun, CRUD misi (misi = kabin), validasi kata sandi, sinkronisasi atomik.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTempData, route, call, login as loginAs, tryLogin } from './helpers.js';
import { passwordProblem } from '../lib/password-policy.js';

useTempData();
let R, store;
before(async () => {
    R = {
        login: await route('login'), db: await route('db'), sync: await route('sync'),
        users: await route('admin/users'), user: await route('admin/users/[id]'),
        missions: await route('admin/missions'), mission: await route('admin/missions/[id]')
    };
    store = await import('../lib/server/store.js');
});
const login = (email, portal, pw) => loginAs(R.login, email, portal, pw);
const sync = (cookie, ...changes) => call(R.sync, 'POST', { cookie, body: { changes } });

// ---------------------------------------------------------------- Aturan kata sandi
test('aturan kata sandi', () => {
    assert.equal(passwordProblem(''), 'required');
    assert.equal(passwordProblem('abc12'), 'short');
    assert.equal(passwordProblem('abcdefgh'), 'mix');
    assert.equal(passwordProblem('12345678'), 'mix');
    assert.equal(passwordProblem(' abcd1234'), 'spaces');
    assert.equal(passwordProblem('x'.repeat(120) + '123456789'), 'long');
    assert.equal(passwordProblem('budi2024', { email: 'budi2024@nasa.gov' }), 'email');
    assert.equal(passwordProblem('Orbit2026', { confirm: 'Orbit2027' }), 'mismatch');
    assert.equal(passwordProblem('Orbit2026', { email: 'budi@nasa.gov', confirm: 'Orbit2026' }), '');
    assert.equal(passwordProblem('password123'), '', 'kata sandi demo tetap valid');
});

// ---------------------------------------------------------------- CRUD akun
test('Admin membuat akun Admin baru; kata sandi lemah ditolak 400', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    const base = { kind: 'admin', name: 'Dr. Budi Santoso', email: 'budi@nasa.gov' };
    for (const password of ['pendek1', 'tanpaangka', '12345678', 'budi1234x'.slice(0, 4), undefined]) {
        const r = await call(R.users, 'POST', { cookie: a, body: { ...base, password } });
        assert.equal(r.status, 400, `password ${password}: ${JSON.stringify(r.data)}`);
    }
    assert.equal((await call(R.users, 'POST', { cookie: a, body: { ...base, email: 'bukan-email', password: 'Orbit2026' } })).status, 400);
    assert.equal((await call(R.users, 'POST', { cookie: a, body: { ...base, email: 'admin2@nasa.gov', password: 'Orbit2026' } })).status, 409);
    const ok = await call(R.users, 'POST', { cookie: a, body: { ...base, password: 'Orbit2026' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.role, 'admin');
    assert.equal(ok.data.user.protected, true);
    assert.ok(!('passwordHash' in ok.data.user));
    await login('budi@nasa.gov', 'admin', 'Orbit2026');
});

test('Admin membuat akun untuk astronot yang belum punya akun', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    // astronot tanpa akun, ditugaskan di misi INC-051
    const r1 = await sync(a,
        { table: 'astronauts', op: 'insert', row: { id: 'AST-0900', name: 'Spec. Rina Putri', sex: 'F' } },
        { table: 'assignments', op: 'insert', row: { id: 'ASG-AST-0900-INC-051', astronautId: 'AST-0900', missionId: 'INC-051', launchDate: '2026-07-01', plannedDays: 180 } });
    assert.equal(r1.data.applied, 2, JSON.stringify(r1.data.rejected));
    const list = await call(R.users, 'GET', { cookie: a });
    assert.ok(list.data.astronautsWithoutAccount.some((x) => x.id === 'AST-0900'));
    const weak = await call(R.users, 'POST', { cookie: a, body: { kind: 'astronaut', astronautId: 'AST-0900', email: 'rina@nasa.gov', password: 'rina' } });
    assert.equal(weak.status, 400);
    const ok = await call(R.users, 'POST', { cookie: a, body: { kind: 'astronaut', astronautId: 'AST-0900', email: 'rina@nasa.gov', password: 'Rina2026!' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.role, 'cabin_member');
    const dup = await call(R.users, 'POST', { cookie: a, body: { kind: 'astronaut', astronautId: 'AST-0900', email: 'rina2@nasa.gov', password: 'Rina2026!' } });
    assert.equal(dup.status, 409);
    // semisi = sekabin: Rina langsung melihat Elena & Kenji (INC-051) dan tidak melihat kru misi lain
    const r = await login('rina@nasa.gov', 'astronot', 'Rina2026!');
    const { data } = await call(R.db, 'GET', { cookie: r });
    assert.deepEqual(data.db.astronauts.map((x) => x.id).sort(), ['AST-0038', 'AST-0154', 'AST-0900']);
});

test('Admin mengubah email & kata sandi akun astronot; sesi lamanya berakhir', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    const k = await login('kenji.takahashi@jaxa.jp', 'astronot');
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-AST-0038' }, body: { password: 'lemah' } })).status, 400);
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-AST-0038' }, body: { email: 'salah' } })).status, 400);
    const r = await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-AST-0038' }, body: { email: 'kenji@jaxa.jp', password: 'Kibo2026x' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.email, 'kenji@jaxa.jp');
    assert.equal((await call(R.db, 'GET', { cookie: k })).status, 401);
    assert.equal((await tryLogin(R.login, 'kenji@jaxa.jp', 'password123', 'astronot')).status, 401);
    await login('kenji@jaxa.jp', 'astronot', 'Kibo2026x');
});

test('Admin lain terlindungi dari ubah/hapus; role tidak bisa diubah lewat PATCH', async () => {
    const a = await login('admin@nasa.gov', 'admin');
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-ADMIN-02' }, body: { password: 'Ambil2026' } })).status, 403);
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-ADMIN-02' }, body: { email: 'x@nasa.gov' } })).status, 403);
    assert.equal((await call(R.user, 'DELETE', { cookie: a, params: { id: 'ACC-ADMIN-02' } })).status, 403);
    assert.equal((await call(R.user, 'DELETE', { cookie: a, params: { id: 'ACC-ADMIN-01' } })).status, 403, 'hapus diri sendiri');
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-AST-0067' }, body: { role: 'admin' } })).status, 403);
    assert.equal((await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-TIDAK-ADA' }, body: { email: 'x@nasa.gov' } })).status, 404);
    // akun sendiri boleh diubah, sesi yang sedang dipakai tetap berlaku
    const r = await call(R.user, 'PATCH', { cookie: a, params: { id: 'ACC-ADMIN-01' }, body: { title: 'Kepala Flight Surgeon', password: 'Surgeon2026' } });
    assert.equal(r.status, 200);
    assert.equal((await call(R.db, 'GET', { cookie: a })).status, 200);
    await login('admin@nasa.gov', 'admin', 'Surgeon2026');
});

test('Admin menghapus akun astronot; profil & data kesehatannya tetap ada', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    const m = await login('marcus.vance@nasa.gov', 'astronot');
    const r = await call(R.user, 'DELETE', { cookie: a, params: { id: 'ACC-AST-0067' } });
    assert.equal(r.status, 200);
    assert.equal((await call(R.db, 'GET', { cookie: m })).status, 401);
    assert.equal((await tryLogin(R.login, 'marcus.vance@nasa.gov', 'password123', 'astronot')).status, 401);
    assert.ok(store.get().astronauts.some((x) => x.id === 'AST-0067'));
    assert.ok(store.get().ocularExams.some((x) => x.assignmentId === 'ASG-AST-0067-INC-004'));
});

test('Bukan Admin tidak bisa memakai API akun & misi', async () => {
    const e = await login('elena.rostova@nasa.gov', 'astronot');
    assert.equal((await call(R.users, 'POST', { cookie: e, body: { kind: 'admin', name: 'X', email: 'x@nasa.gov', password: 'Orbit2026' } })).status, 403);
    assert.equal((await call(R.user, 'PATCH', { cookie: e, params: { id: 'ACC-AST-0154' }, body: { password: 'Orbit2026' } })).status, 403);
    assert.equal((await call(R.user, 'DELETE', { cookie: e, params: { id: 'ACC-AST-0038' } })).status, 403);
    assert.equal((await call(R.missions, 'GET', { cookie: e })).status, 403);
    assert.equal((await call(R.missions, 'POST', { cookie: e, body: { id: 'INC-099', name: 'X', startDate: '2027-01-01' } })).status, 403);
    assert.equal((await call(R.mission, 'DELETE', { cookie: e, params: { id: 'INC-051' } })).status, 403);
    assert.equal((await call(R.missions, 'GET')).status, 401);
});

// ---------------------------------------------------------------- CRUD misi (misi = kabin)
test('Admin membuat misi: kabinnya ikut dibuat', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    const bad = [
        { id: 'X', name: 'A', startDate: '2027-01-01' },
        { id: 'INC 063', name: 'A', startDate: '2027-01-01' },
        { id: 'INC-063', name: '', startDate: '2027-01-01' },
        { id: 'INC-063', name: 'A', startDate: '2027-02-30' },
        { id: 'INC-063', name: 'A', startDate: '2027-03-01', endDate: '2027-02-01' }
    ];
    for (const body of bad) assert.equal((await call(R.missions, 'POST', { cookie: a, body })).status, 400, JSON.stringify(body));
    const r = await call(R.missions, 'POST', { cookie: a, body: { id: 'inc-063', name: 'Ekspedisi 63', startDate: '2027-01-10', endDate: '2027-07-10' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.mission.id, 'INC-063');
    assert.equal(r.data.mission.cabin.id, 'INC-063-N2');
    assert.ok(store.get().modules.some((m) => m.id === 'INC-063-N2' && m.missionId === 'INC-063'));
    assert.equal((await call(R.missions, 'POST', { cookie: a, body: { id: 'INC-063', name: 'Lagi', startDate: '2027-01-10' } })).status, 409);
});

test('Admin mengubah misi; kode misi tidak bisa diganti', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    const r = await call(R.mission, 'PATCH', { cookie: a, params: { id: 'INC-063' }, body: { name: 'Ekspedisi 63 (revisi)', cabinName: 'Node 3 Tranquility', endDate: null } });
    assert.equal(r.status, 200);
    assert.equal(r.data.mission.name, 'Ekspedisi 63 (revisi)');
    assert.equal(r.data.mission.endDate, null);
    assert.equal(r.data.mission.cabin.name, 'Node 3 Tranquility');
    assert.equal((await call(R.mission, 'PATCH', { cookie: a, params: { id: 'INC-063' }, body: { id: 'INC-064' } })).status, 400);
    assert.equal((await call(R.mission, 'PATCH', { cookie: a, params: { id: 'INC-063' }, body: { endDate: '2026-01-01' } })).status, 400);
    assert.equal((await call(R.mission, 'PATCH', { cookie: a, params: { id: 'INC-404' }, body: { name: 'x' } })).status, 404);
});

test('Misi & kabin tidak bisa dibuat/dihapus lewat /api/sync', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    const r = await sync(a, { table: 'missions', op: 'insert', row: { id: 'INC-777', name: 'X', startDate: '2027-01-01' } });
    assert.equal(r.data.applied, 0);
    assert.equal((await sync(a, { table: 'modules', op: 'insert', row: { id: 'INC-777-N2', missionId: 'INC-777' } })).data.applied, 0);
    assert.equal((await sync(a, { table: 'modules', op: 'delete', row: { id: 'INC-051-N2' } })).data.applied, 0);
    assert.equal((await sync(a, { table: 'missions', op: 'delete', row: { id: 'INC-051' } })).data.applied, 0);
});

test('Semisi = sekabin: kabin penugasan selalu kabin misinya', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    // client mencoba menaruh astronot misi INC-063 di kabin misi lain
    const r = await sync(a,
        { table: 'astronauts', op: 'insert', row: { id: 'AST-0901', name: 'Eng. Dimas', sex: 'M' } },
        { table: 'assignments', op: 'insert', row: { id: 'ASG-AST-0901-INC-063', astronautId: 'AST-0901', missionId: 'INC-063', quartersModuleId: 'INC-051-N2', launchDate: '2027-01-10', plannedDays: 180 } });
    assert.equal(r.data.applied, 2);
    assert.equal(store.get().assignments.find((x) => x.id === 'ASG-AST-0901-INC-063').quartersModuleId, 'INC-063-N2');
    // misi yang belum ada ditolak
    const r2 = await sync(a,
        { table: 'astronauts', op: 'insert', row: { id: 'AST-0902', name: 'X', sex: 'M' } },
        { table: 'assignments', op: 'insert', row: { id: 'ASG-AST-0902-INC-999', astronautId: 'AST-0902', missionId: 'INC-999', launchDate: '2027-01-10', plannedDays: 180 } });
    assert.equal(r2.data.applied, 0);
    assert.match(r2.data.rejected[0].reason, /belum ada/);
    // satu astronot tidak bisa dua kali di misi yang sama
    const r3 = await sync(a, { table: 'assignments', op: 'insert', row: { id: 'ASG-DUP', astronautId: 'AST-0901', missionId: 'INC-063', launchDate: '2027-01-10', plannedDays: 180 } });
    assert.equal(r3.data.applied, 0);
});

test('Sinkronisasi atomik: pendaftaran dengan kata sandi lemah tidak menyisakan data setengah jadi', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    const before = JSON.stringify(store.get());
    const r = await sync(a,
        { table: 'astronauts', op: 'insert', row: { id: 'AST-0903', name: 'Lt. Sari', sex: 'F' } },
        { table: 'accounts', op: 'insert', row: { id: 'ACC-AST-0903', role: 'astronaut', astronautId: 'AST-0903', email: 'sari@nasa.gov', password: '123' } },
        { table: 'assignments', op: 'insert', row: { id: 'ASG-AST-0903-INC-051', astronautId: 'AST-0903', missionId: 'INC-051', launchDate: '2026-07-01', plannedDays: 180 } });
    assert.equal(r.data.applied, 0);
    assert.equal(r.data.rejected.length, 1);
    assert.match(r.data.rejected[0].reason, /minimal 8/);
    assert.equal(JSON.stringify(store.get()), before, 'database tidak berubah sama sekali');
});

test('Hapus misi: ditolak jika masih ada astronot; misi kosong terhapus bersama kabinnya', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    assert.equal((await call(R.mission, 'DELETE', { cookie: a, params: { id: 'INC-051' } })).status, 409);
    assert.equal((await call(R.mission, 'DELETE', { cookie: a, params: { id: 'INC-063' } })).status, 409);
    // pindahkan Dimas lalu hapus misinya
    assert.equal((await sync(a, { table: 'assignments', op: 'delete', row: { id: 'ASG-AST-0901-INC-063' } })).data.applied, 1);
    const r = await call(R.mission, 'DELETE', { cookie: a, params: { id: 'INC-063' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.removedCabins, ['INC-063-N2']);
    assert.ok(!store.get().missions.some((m) => m.id === 'INC-063'));
    assert.ok(!store.get().modules.some((m) => m.id === 'INC-063-N2'));
    assert.equal((await call(R.mission, 'DELETE', { cookie: a, params: { id: 'INC-063' } })).status, 404);
});

test('Pemimpin yang penugasannya dihapus otomatis dilepas dari kabin', async () => {
    const a = await login('admin2@nasa.gov', 'admin');
    assert.equal(store.get().modules.find((m) => m.id === 'INC-051-N2').leaderAstronautId, 'AST-0154');
    assert.equal((await sync(a, { table: 'assignments', op: 'delete', row: { id: 'ASG-AST-0154-INC-051' } })).data.applied, 1);
    assert.equal(store.get().modules.find((m) => m.id === 'INC-051-N2').leaderAstronautId, null);
});
