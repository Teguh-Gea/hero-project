// Uji khusus mode Postgres (Vercel + Neon) memakai database tiruan: data pertama kali diisi dari seed,
// sesi tersimpan di database (bukan memori), dan penulisan bersamaan tidak saling menimpa.
process.env.HERO_TEST_PG = '1';
const { test, before } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const crypto = await import('node:crypto');
const { useTempData, dbNow, route, call, login: loginAs } = await import('./helpers.js');

useTempData({ seed: null });
const fake = globalThis.__heroFakePg;
let R, store;
before(async () => {
    R = { login: await route('login'), db: await route('db'), sync: await route('sync'), logout: await route('logout'), missions: await route('admin/missions') };
    store = await import('../lib/server/store.js');
});
const login = (email, portal) => loginAs(R.login, email, portal);

test('database kosong diisi otomatis dari data simulasi saat pertama dipakai', async () => {
    assert.equal(fake.db.state, null);
    const db = await dbNow();
    assert.equal(db.accounts.length, 15);
    assert.equal(fake.db.state.version, 1);
    assert.ok(fake.db.state.data.accounts.every((a) => a.passwordHash && !a.password));
});

test('sesi disimpan di database sebagai hash, bukan di memori server', async () => {
    const cookie = await login('teguh@hero.com', 'admin');
    const sid = cookie.split('=')[1];
    const hash = crypto.createHash('sha256').update(sid).digest('hex');
    assert.ok(fake.db.sessions.has(hash));
    assert.ok(![...fake.db.sessions.keys()].includes(sid), 'ID sesi mentah tidak tersimpan');
    // instance server lain (memori kosong) tetap mengenali sesi ini
    globalThis.__heroAuth.sessions.clear();
    assert.equal((await call(R.db, 'GET', { cookie })).status, 200);
    await call(R.logout, 'POST', { cookie });
    assert.ok(!fake.db.sessions.has(hash));
    assert.equal((await call(R.db, 'GET', { cookie })).status, 401);
});

test('batas percobaan login tersimpan di database', async () => {
    const ip = '10.9.9.9';
    const attempt = () => R.login.POST(new Request('http://localhost/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hero-request': '1', 'x-forwarded-for': ip },
        body: JSON.stringify({ email: 'teguh@hero.com', password: 'salah', portal: 'admin' })
    }));
    for (let i = 0; i < 8; i++) assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 429);
    assert.equal(fake.db.attempts.get(ip).count, 8);
});

test('dua penulisan bersamaan sama-sama tersimpan (konflik diulang otomatis)', async () => {
    const a = await login('teguh@hero.com', 'admin');
    const b = await login('jeremy@hero.com', 'admin');
    const before = fake.db.state.version;
    const mk = (cookie, id) => call(R.missions, 'POST', { cookie, body: { id, name: `Misi ${id}`, startDate: '2027-01-01' } });
    const [r1, r2, r3] = await Promise.all([mk(a, 'INC-201'), mk(b, 'INC-202'), mk(a, 'INC-203')]);
    assert.deepEqual([r1.status, r2.status, r3.status], [201, 201, 201]);
    const ids = (await dbNow()).missions.map((m) => m.id);
    for (const id of ['INC-201', 'INC-202', 'INC-203']) assert.ok(ids.includes(id), `${id} tersimpan`);
    assert.equal(fake.db.state.version, before + 3);
    assert.ok(fake.db.log.filter((n) => n === 'stateUpdate').length >= 4, 'ada konflik yang diulang');
});

test('optimistic locking: penulisan dengan versi lama ditolak', async () => {
    const stale = await store.withRequestDb(async () => {
        await store.load();
        // permintaan lain menyimpan lebih dulu
        await store.withRequestDb(async () => {
            await store.load();
            store.get().missions.push({ id: 'INC-301', name: 'Lebih dulu', vehicle: 'ISS', startDate: '2027-01-01', endDate: null });
            await store.save();
        });
        store.get().missions.push({ id: 'INC-302', name: 'Terlambat', vehicle: 'ISS', startDate: '2027-01-01', endDate: null });
        try { await store.save(); return null; } catch (err) { return err; }
    });
    assert.ok(stale && stale.status === 409 && stale.retry);
    const ids = (await dbNow()).missions.map((m) => m.id);
    assert.ok(ids.includes('INC-301') && !ids.includes('INC-302'));
});
