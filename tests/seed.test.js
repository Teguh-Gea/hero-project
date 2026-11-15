// Uji data simulasi bawaan (lib/server/seed.json): 6 Admin, 9 astronot di 3 misi, semua bisa masuk.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { useTempData, route, call, login as loginAs } from './helpers.js';

useTempData({ seed: path.join(process.cwd(), 'lib', 'server', 'seed.json') });
let R, db;
before(async () => {
    R = { login: await route('login'), db: await route('db'), session: await route('session'), sync: await route('sync') };
    db = (await import('../lib/server/store.js')).get();
});

const ADMINS = ['teguh', 'jeremy', 'naila', 'abel', 'vinson', 'nabillah'];

test('hanya akun simulasi: 6 Admin + 9 astronot, email @hero.com', () => {
    assert.equal(db.accounts.length, 15);
    assert.deepEqual(db.accounts.filter((a) => a.role === 'admin').map((a) => a.email), ADMINS.map((n) => `${n}@hero.com`));
    const astro = db.accounts.filter((a) => a.role === 'astronaut');
    assert.equal(astro.length, 9);
    for (const a of db.accounts) {
        assert.match(a.email, /^[a-z]+@hero\.com$/);
        assert.ok(a.passwordHash && !('password' in a), 'kata sandi disimpan sebagai hash');
    }
    // nama depan astronot = bagian email
    for (const a of astro) {
        const name = db.astronauts.find((x) => x.id === a.astronautId).name;
        assert.equal(name.split(' ')[1].toLowerCase(), a.email.split('@')[0]);
    }
    assert.equal(new Set(db.accounts.map((a) => a.email)).size, 15);
});

test('3 misi, masing-masing 3 astronot di kabin misinya dengan 1 Pemimpin Cabin', () => {
    assert.equal(db.missions.length, 3);
    for (const m of db.missions) {
        const cabin = db.modules.find((x) => x.missionId === m.id);
        const crew = db.assignments.filter((a) => a.missionId === m.id);
        assert.equal(crew.length, 3, m.id);
        assert.ok(crew.every((a) => a.quartersModuleId === cabin.id), `${m.id}: semisi = sekabin`);
        assert.ok(crew.some((a) => a.astronautId === cabin.leaderAstronautId), `${m.id}: pemimpin dari kru sendiri`);
    }
    assert.equal(new Set(db.assignments.map((a) => a.astronautId)).size, 9, 'tiap astronot di satu misi');
});

test('data kesehatan lengkap untuk setiap astronot dan kabin', () => {
    for (const a of db.assignments) {
        const oc = db.ocularExams.filter((r) => r.assignmentId === a.id);
        assert.equal(oc.filter((r) => r.phase === 'preflight').length, 2, `${a.id} pra-terbang OD+OS`);
        assert.ok(oc.filter((r) => r.phase === 'inflight' && r.eye === 'OD').length >= 3, `${a.id} scan di orbit`);
        for (const t of ['mentalAssessments', 'vitalSigns']) assert.ok(db[t].filter((r) => r.assignmentId === a.id).length >= 4, `${a.id} ${t}`);
        assert.ok(db.countermeasureLogs.filter((r) => r.assignmentId === a.id).length >= 3);
    }
    for (const m of db.modules) assert.ok(db.cabinReadings.filter((r) => r.moduleId === m.id).length >= 3, m.id);
});

test('semua akun bisa masuk dengan password123 di portalnya', async () => {
    for (const a of db.accounts) await loginAs(R.login, a.email, a.role === 'admin' ? 'admin' : 'astronot');
});

test('astronot hanya melihat rekan semisi; hanya pemimpin yang mengisi data kabin', async () => {
    for (const m of db.missions) {
        const cabin = db.modules.find((x) => x.missionId === m.id);
        const crewIds = db.assignments.filter((a) => a.missionId === m.id).map((a) => a.astronautId).sort();
        for (const id of crewIds) {
            const acc = db.accounts.find((a) => a.astronautId === id);
            const cookie = await loginAs(R.login, acc.email, 'astronot');
            const view = (await call(R.db, 'GET', { cookie })).data.db;
            assert.deepEqual(view.astronauts.map((x) => x.id).sort(), crewIds, `${acc.email} melihat kru ${m.id}`);
            const role = (await call(R.session, 'GET', { cookie })).data.user.appRole;
            assert.equal(role, id === cabin.leaderAstronautId ? 'cabin_leader' : 'cabin_member');
            const r = await call(R.sync, 'POST', { cookie, body: { changes: [{ table: 'cabinReadings', op: 'insert', row: { id: `CAB-T-${id}`, moduleId: cabin.id, date: '2026-11-15', co2: 3 } }] } });
            assert.equal(r.data.applied, id === cabin.leaderAstronautId ? 1 : 0, acc.email);
        }
    }
});
