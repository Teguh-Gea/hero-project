// Penyimpanan data HERO.
//   - Postgres (Neon, untuk Vercel): aktif jika DATABASE_URL ada. Seluruh data disimpan sebagai JSONB
//     di tabel hero_state. Setiap permintaan membaca salinannya sendiri, dan penyimpanan memakai
//     optimistic locking (kolom version): jika ada penulis lain di antaranya, permintaan diulang.
//   - File JSON (untuk komputer sendiri): data/hero-db.json, ditulis atomik (file sementara lalu rename).
// Route Handler memakai get()/replace()/save() secara sinkron setelah load() dipanggil oleh handler().
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { hashPassword } from './auth.js';
import { usePostgres, q } from './pg.js';
import seedData from './seed.js';

const DATA_DIR = process.env.HERO_DATA_DIR || path.join(process.cwd(), 'data');
export const DB_FILE = path.join(DATA_DIR, 'hero-db.json');

export const TABLES = [
    'accounts', 'astronauts', 'missions', 'modules', 'assignments',
    'ocularExams', 'mentalAssessments', 'vitalSigns', 'countermeasureLogs', 'cabinReadings', 'interventions'
];

// Mode file: satu salinan untuk seluruh proses (disimpan di globalThis agar tahan hot reload `next dev`)
const fileState = (globalThis.__heroStore ??= { db: null, writeChain: Promise.resolve() });
// Mode Postgres: salinan per permintaan, supaya permintaan yang berjalan bersamaan tidak saling menimpa
const requestDb = new AsyncLocalStorage();

export class ConflictError extends Error {
    constructor() {
        super('Data baru saja diubah pengguna lain. Silakan coba lagi.');
        this.status = 409;
        this.retry = true;
    }
}

function setupError() {
    return Object.assign(new Error('Database belum tersambung: DATABASE_URL tidak ditemukan. Di Vercel, hubungkan Neon lewat tab Storage lalu deploy ulang.'), { status: 503 });
}

function buildFromSeed() {
    // HERO_SEED_FILE hanya untuk uji otomatis (tests/fixtures/seed.json)
    const seed = process.env.HERO_SEED_FILE
        ? JSON.parse(fs.readFileSync(process.env.HERO_SEED_FILE, 'utf8'))
        : structuredClone(seedData);
    // Kata sandi contoh di seed disimpan polos; di database selalu jadi hash scrypt
    seed.accounts = seed.accounts.map((a) => {
        const { password, ...rest } = a;
        return { ...rest, passwordHash: hashPassword(password || 'password123') };
    });
    seed.updatedAt = new Date().toISOString();
    return seed;
}

function normalize(db) {
    const out = typeof db === 'string' ? JSON.parse(db) : db;
    TABLES.forEach((t) => { if (!Array.isArray(out[t])) out[t] = []; });
    return out;
}

function ctx() {
    if (!usePostgres()) return fileState;
    const c = requestDb.getStore();
    if (!c) throw new Error('store.load() harus dipanggil di dalam withRequestDb().');
    return c;
}

// Jalankan fn dengan salinan data milik permintaan ini (mode Postgres). Di mode file langsung dijalankan.
export function withRequestDb(fn) {
    return usePostgres() ? requestDb.run({ db: null, version: null }, fn) : fn();
}

function persistFile() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(fileState.db, null, 1));
    fs.renameSync(tmp, DB_FILE);
}

// Muat data. Postgres: selalu dibaca ulang (instance lain mungkin sudah mengubahnya).
export async function load() {
    if (usePostgres()) {
        const c = ctx();
        let rows;
        try {
            rows = await q('stateGet');
            if (!rows.length) {
                // Pertama kali: isi dari data simulasi. ON CONFLICT menjaga jika dua instance melakukannya bersamaan.
                await q('stateInsert', [JSON.stringify(buildFromSeed())]);
                rows = await q('stateGet');
            }
        }
        catch (err) {
            console.error('Gagal terhubung ke database:', err);
            throw Object.assign(new Error(`Gagal terhubung ke database${err && err.code ? ` (${err.code})` : ''}. Periksa DATABASE_URL di Vercel (Settings → Environment Variables), lalu deploy ulang.`), { status: 503 });
        }
        c.db = normalize(rows[0].data);
        c.version = Number(rows[0].version);
        return c.db;
    }
    if (process.env.VERCEL) throw setupError();
    if (!fileState.db) {
        if (fs.existsSync(DB_FILE)) fileState.db = normalize(fs.readFileSync(DB_FILE, 'utf8'));
        else {
            fileState.db = buildFromSeed();
            persistFile();
        }
    }
    return fileState.db;
}

export function get() {
    const c = ctx();
    if (!c.db) throw new Error('Database belum dimuat (panggil store.load() dulu).');
    return c.db;
}

// Ganti seluruh isi database dengan salinan yang sudah divalidasi (lihat applyAtomic)
export function replace(next) {
    ctx().db = next;
    return next;
}

export async function save() {
    const c = ctx();
    c.db.updatedAt = new Date().toISOString();
    if (usePostgres()) {
        const rows = await q('stateUpdate', [JSON.stringify(c.db), c.version]);
        if (!rows.length) throw new ConflictError();
        c.version = Number(rows[0].version);
        return;
    }
    fileState.writeChain = fileState.writeChain.then(() => persistFile()).catch((err) => console.error('Gagal menyimpan database:', err));
    return fileState.writeChain;
}

// Kembali ke data simulasi (menimpa tanpa memeriksa versi)
export async function reset() {
    const c = ctx();
    c.db = buildFromSeed();
    if (usePostgres()) {
        let rows = await q('stateOverwrite', [JSON.stringify(c.db)]);
        if (!rows.length) {
            await q('stateInsert', [JSON.stringify(c.db)]);
            rows = await q('stateGet');
        }
        c.version = Number(rows[0].version);
        return;
    }
    return save();
}
