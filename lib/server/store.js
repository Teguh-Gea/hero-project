// Penyimpanan data HERO: satu file JSON, ditulis atomik (tulis ke file sementara lalu rename).
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

const DATA_DIR = process.env.HERO_DATA_DIR || path.join(process.cwd(), 'data');
export const DB_FILE = path.join(DATA_DIR, 'hero-db.json');
const SEED_FILE = path.join(process.cwd(), 'lib', 'server', 'seed.json');

export const TABLES = [
    'accounts', 'astronauts', 'missions', 'modules', 'assignments',
    'ocularExams', 'mentalAssessments', 'vitalSigns', 'countermeasureLogs', 'cabinReadings', 'interventions'
];

// Disimpan di globalThis agar data dan antrean tulis tetap satu salinan
// walau modul dimuat ulang (hot reload di `next dev`)
const state = (globalThis.__heroStore ??= { db: null, writeChain: Promise.resolve() });

function buildFromSeed() {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    // Kata sandi contoh di seed disimpan polos; di database selalu jadi hash scrypt
    seed.accounts = seed.accounts.map((a) => {
        const { password, ...rest } = a;
        return { ...rest, passwordHash: hashPassword(password || 'password123') };
    });
    seed.updatedAt = new Date().toISOString();
    return seed;
}

function load() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
        state.db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        TABLES.forEach((t) => { if (!Array.isArray(state.db[t])) state.db[t] = []; });
    }
    else {
        state.db = buildFromSeed();
        persistNow();
    }
    return state.db;
}

function persistNow() {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state.db, null, 1));
    fs.renameSync(tmp, DB_FILE);
}

// Database dimuat saat pertama kali dibutuhkan
export function get() {
    return state.db || load();
}

export function save() {
    const db = get();
    db.updatedAt = new Date().toISOString();
    state.writeChain = state.writeChain.then(() => persistNow()).catch((err) => console.error('Gagal menyimpan database:', err));
    return state.writeChain;
}

// Ganti seluruh isi database dengan salinan yang sudah divalidasi (lihat applyAtomic)
export function replace(next) {
    state.db = next;
    return state.db;
}

export function reset() {
    state.db = buildFromSeed();
    return save();
}
