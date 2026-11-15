// Penyimpanan data HERO: satu file JSON, ditulis atomik (tulis ke file sementara lalu rename).
'use strict';
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const DATA_DIR = process.env.HERO_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'hero-db.json');
const SEED_FILE = path.join(__dirname, 'seed.json');

const TABLES = [
    'accounts', 'astronauts', 'missions', 'modules', 'assignments',
    'ocularExams', 'mentalAssessments', 'vitalSigns', 'countermeasureLogs', 'cabinReadings', 'interventions'
];

let db = null;
let writeChain = Promise.resolve();

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
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        TABLES.forEach((t) => { if (!Array.isArray(db[t])) db[t] = []; });
    }
    else {
        db = buildFromSeed();
        persistNow();
    }
    return db;
}

function persistNow() {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
}

function save() {
    db.updatedAt = new Date().toISOString();
    writeChain = writeChain.then(() => persistNow()).catch((err) => console.error('Gagal menyimpan database:', err));
    return writeChain;
}

function reset() {
    db = buildFromSeed();
    return save();
}

module.exports = { load, save, reset, get: () => db, TABLES, DB_FILE };
