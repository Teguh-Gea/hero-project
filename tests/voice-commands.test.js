// Setiap frasa di daftar perintah harus dipahami HERO AI Assistant persis seperti yang dijelaskan,
// dalam bahasa Inggris dan Indonesia, untuk Admin maupun astronot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandCatalog, resolveSiteCommand, resolveFuzzyHeroIntent, detectVoiceBargeIn, MINIMIZE_PATTERN, astronautCallName } from '../lib/voice-commands.js';

const ASTRONAUTS = [
    { id: 'AST-0101', name: 'Cmdr. Raka Pratama', inc: 'INC-071' },
    { id: 'AST-0102', name: 'Dr. Sari Wulandari', inc: 'INC-071' },
    { id: 'AST-0104', name: 'Cmdr. Putri Anggraini', inc: 'INC-072' }
];
const MISSIONS = ['INC-071', 'INC-072'];

function understand(phrase, lang) {
    return { site: resolveSiteCommand(phrase, ASTRONAUTS), fuzzy: resolveFuzzyHeroIntent(phrase, lang) };
}

function check(c, lang) {
    const phrase = lang === 'en' ? c.en : c.id;
    const e = c.expect;
    const r = understand(phrase, lang);
    const where = `${lang}: "${phrase}"`;
    if (e.bargeIn) return assert.ok(detectVoiceBargeIn(phrase).isBargeIn, where);
    if (e.minimize) return assert.match(phrase, MINIMIZE_PATTERN, where);
    if (e.site) {
        assert.ok(r.site, `${where} harus dikenali sebagai perintah ${e.site}`);
        assert.equal(r.site.type, e.site, where);
        for (const k of ['tab', 'mode']) if (e[k]) assert.equal(r.site[k], e[k], where);
        return;
    }
    // Perintah tampilan/protokol diproses mesin fuzzy; tidak boleh tertangkap lebih dulu oleh perintah situs
    assert.equal(r.site, null, `${where} tertangkap perintah situs ${r.site && r.site.type}`);
    assert.equal(r.fuzzy.type, e.fuzzy, where);
    if (e.category) assert.equal(r.fuzzy.category, e.category, `${where} kategori`);
    if (e.section) assert.equal(r.fuzzy.section, e.section, `${where} bagian`);
    if (e.rxKey) assert.equal(r.fuzzy.rxKey, e.rxKey, `${where} protokol`);
    if (e.on !== undefined) assert.equal(r.fuzzy.targetState, e.on, `${where} nyala/mati`);
}

for (const isAdmin of [true, false]) {
    for (const lang of ['en', 'id']) {
        test(`${isAdmin ? 'Admin' : 'Astronot'} (${lang}): semua frasa di daftar dipahami dengan tepat`, () => {
            const catalog = buildCommandCatalog({ isAdmin, astronauts: ASTRONAUTS, missions: MISSIONS });
            for (const c of catalog) check(c, lang);
        });
    }
}

test('daftar astronot tidak memuat perintah khusus Admin', () => {
    const all = buildCommandCatalog({ isAdmin: true, astronauts: ASTRONAUTS, missions: MISSIONS });
    const crew = buildCommandCatalog({ isAdmin: false, astronauts: ASTRONAUTS, missions: MISSIONS });
    assert.ok(all.length > crew.length);
    for (const c of crew) assert.ok(!c.admin);
    const phrases = crew.map((c) => c.en);
    for (const p of ['Open missions', 'Open users', 'Open research and SQL', 'Add astronaut', 'Activate LBNP', 'Show all missions']) {
        assert.ok(!phrases.includes(p), p);
    }
});

test('contoh nama memakai astronot yang sedang terlihat', () => {
    assert.equal(astronautCallName('Cmdr. Raka Pratama'), 'Raka');
    assert.equal(astronautCallName('Dr. Sari Wulandari'), 'Sari');
    const solo = buildCommandCatalog({ isAdmin: false, astronauts: [ASTRONAUTS[0]], missions: [] });
    assert.ok(!solo.some((c) => c.en.startsWith('Select astronaut')), 'tidak ada contoh pilih astronot jika hanya satu');
});

test('perintah halaman tidak bentrok dengan filter misi', () => {
    assert.equal(resolveSiteCommand('show mission INC-072', ASTRONAUTS).type, 'mission');
    assert.equal(resolveSiteCommand('tampilkan misi INC-071', ASTRONAUTS).type, 'mission');
    assert.equal(resolveSiteCommand('open missions', ASTRONAUTS).tab, 'missions');
    assert.equal(resolveSiteCommand('buka halaman misi', ASTRONAUTS).tab, 'missions');
    assert.equal(resolveSiteCommand('show all missions', ASTRONAUTS).inc, 'ALL');
});
