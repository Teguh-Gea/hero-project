// Aturan hak akses HERO. Semua keputusan akses dibuat di sini, di server.
//   admin     : baca & kelola seluruh data
//   astronot  : baca data diri + rekan sekabin (modul yang sama) + bacaan kabin modulnya;
//               kelola data pemeriksaan & profil diri sendiri;
//               bacaan lingkungan kabin hanya boleh diubah pemimpin kabin modul itu.
'use strict';
const { hashPassword } = require('./auth');

const EXAM_TABLES = new Set(['ocularExams', 'mentalAssessments', 'vitalSigns', 'countermeasureLogs']);
const ALL_TABLES = new Set(['accounts', 'astronauts', 'missions', 'modules', 'assignments', 'cabinReadings', 'interventions', ...EXAM_TABLES]);
const ASTRO_PROFILE_FIELDS = ['name', 'jobRole', 'agency', 'sex', 'birthDate', 'weightKg', 'familyHistoryGlaucoma'];
const ASSIGNMENT_SELF_FIELDS = ['plannedDays', 'schedLabel', 'scanIntervalDays'];
const MAX_ROW_BYTES = 20000;

function publicAccount(a, full) {
    const base = { id: a.id, email: a.email, role: a.role, astronautId: a.astronautId || null, name: a.name || '' };
    return full ? { ...base, title: a.title || null } : base;
}

function scopeFor(account, db) {
    if (!account) return null;
    if (account.role === 'admin') return { isAdmin: true };
    const me = account.astronautId;
    const ownAsg = db.assignments.filter((a) => a.astronautId === me);
    const ownAsgIds = new Set(ownAsg.map((a) => a.id));
    const moduleIds = new Set(ownAsg.map((a) => a.quartersModuleId).filter(Boolean));
    const mateAsg = db.assignments.filter((a) => moduleIds.has(a.quartersModuleId));
    const asgIds = new Set([...ownAsgIds, ...mateAsg.map((a) => a.id)]);
    const astronautIds = new Set([me, ...mateAsg.map((a) => a.astronautId)]);
    const leaderModuleIds = new Set(db.modules.filter((m) => m.leaderAstronautId === me && moduleIds.has(m.id)).map((m) => m.id));
    const missionIds = new Set(db.assignments.filter((a) => asgIds.has(a.id)).map((a) => a.missionId));
    return { isAdmin: false, me, ownAsgIds, asgIds, astronautIds, moduleIds, leaderModuleIds, missionIds };
}

// Salinan database yang boleh dilihat akun ini (tanpa hash kata sandi)
function filterDb(account, db) {
    const s = scopeFor(account, db);
    if (!s) return null;
    if (s.isAdmin) {
        return {
            ...db,
            accounts: db.accounts.map((a) => publicAccount(a, true))
        };
    }
    return {
        version: db.version,
        updatedAt: db.updatedAt,
        accounts: db.accounts.filter((a) => s.astronautIds.has(a.astronautId)).map((a) => publicAccount(a, false)),
        astronauts: db.astronauts.filter((a) => s.astronautIds.has(a.id)),
        missions: db.missions.filter((m) => s.missionIds.has(m.id)),
        modules: db.modules.filter((m) => s.moduleIds.has(m.id)),
        assignments: db.assignments.filter((a) => s.asgIds.has(a.id)),
        ocularExams: db.ocularExams.filter((r) => s.asgIds.has(r.assignmentId)),
        mentalAssessments: db.mentalAssessments.filter((r) => s.asgIds.has(r.assignmentId)),
        vitalSigns: db.vitalSigns.filter((r) => s.asgIds.has(r.assignmentId)),
        countermeasureLogs: db.countermeasureLogs.filter((r) => s.asgIds.has(r.assignmentId)),
        cabinReadings: db.cabinReadings.filter((r) => s.moduleIds.has(r.moduleId)),
        interventions: db.interventions.filter((r) => s.asgIds.has(r.assignmentId))
    };
}

function cleanRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    if (typeof row.id !== 'string' || !row.id || row.id.length > 80) return null;
    if (JSON.stringify(row).length > MAX_ROW_BYTES) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (k.startsWith('_')) continue;
        if (typeof v === 'number' && !Number.isFinite(v)) continue;
        out[k] = v;
    }
    return out;
}

const pick = (src, keys) => Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, src[k]]));
const deny = (reason) => ({ ok: false, reason });

// Satu perubahan dari klien: { table, op: 'insert' | 'update' | 'delete', row }
// Mengembalikan { ok, row } untuk diterapkan atau { ok: false, reason }.
function authorizeChange(account, db, change) {
    const { table, op } = change || {};
    if (!ALL_TABLES.has(table)) return deny('Tabel tidak dikenal.');
    if (!['insert', 'update', 'delete'].includes(op)) return deny('Operasi tidak dikenal.');
    const row = cleanRow(change.row);
    if (!row) return deny('Data baris tidak valid.');
    const list = db[table];
    const existing = list.find((r) => r.id === row.id) || null;
    if (op === 'insert' && existing) return deny('ID sudah ada.');
    if (op !== 'insert' && !existing) return deny('Data tidak ditemukan.');
    const s = scopeFor(account, db);

    // --- Akun: kata sandi selalu di-hash di server, hash dari klien diabaikan
    if (table === 'accounts') {
        const email = row.email != null ? String(row.email).trim().toLowerCase() : null;
        if (email && db.accounts.some((a) => a.email === email && a.id !== row.id)) return deny(`Email ${email} sudah dipakai.`);
        if (s.isAdmin) {
            if (op === 'delete') return row.id === account.id ? deny('Admin tidak bisa menghapus akunnya sendiri.') : { ok: true };
            if (op === 'insert') {
                if (!email) return deny('Email wajib diisi.');
                if (!['admin', 'astronaut'].includes(row.role)) return deny('Peran akun tidak valid.');
                if (row.role === 'astronaut' && !db.astronauts.some((a) => a.id === row.astronautId)) return deny('Astronot untuk akun ini belum ada.');
                const pw = String(row.password || '');
                if (pw.length < 8) return deny('Kata sandi minimal 8 karakter.');
                return { ok: true, row: { id: row.id, email, role: row.role, astronautId: row.astronautId || null, name: row.name || '', title: row.title || null, passwordHash: hashPassword(pw) } };
            }
            if (row.id === account.id && row.role && row.role !== 'admin') return deny('Admin tidak bisa menurunkan perannya sendiri.');
            const next = { ...existing, ...pick(row, ['email', 'name', 'title', 'role']), ...(email ? { email } : {}) };
            if (row.password) {
                if (String(row.password).length < 8) return deny('Kata sandi minimal 8 karakter.');
                next.passwordHash = hashPassword(row.password);
            }
            return { ok: true, row: next };
        }
        if (op !== 'update' || row.id !== account.id) return deny('Astronot hanya bisa mengubah akunnya sendiri.');
        return { ok: true, row: { ...existing, ...(email ? { email } : {}), ...pick(row, ['name']) } };
    }

    if (s.isAdmin) {
        if (table === 'modules' && row.leaderAstronautId) {
            const inModule = db.assignments.some((a) => a.quartersModuleId === row.id && a.astronautId === row.leaderAstronautId);
            if (!inModule) return deny('Pemimpin kabin harus kru yang ditugaskan di modul tersebut.');
        }
        return { ok: true, row: op === 'delete' ? null : row };
    }

    // --- Astronot
    if (table === 'astronauts') {
        if (op !== 'update' || row.id !== s.me) return deny('Astronot hanya bisa mengubah profilnya sendiri.');
        return { ok: true, row: { ...existing, ...pick(row, ASTRO_PROFILE_FIELDS) } };
    }
    if (table === 'assignments') {
        if (op !== 'update' || !s.ownAsgIds.has(row.id)) return deny('Penugasan hanya bisa diubah admin.');
        return { ok: true, row: { ...existing, ...pick(row, ASSIGNMENT_SELF_FIELDS) } };
    }
    if (EXAM_TABLES.has(table)) {
        const before = existing ? existing.assignmentId : row.assignmentId;
        const after = op === 'delete' ? before : row.assignmentId;
        if (!s.ownAsgIds.has(before) || !s.ownAsgIds.has(after)) return deny('Astronot hanya bisa mengelola data pemeriksaannya sendiri. Data rekan sekabin hanya bisa dilihat.');
        return { ok: true, row: op === 'delete' ? null : row };
    }
    if (table === 'cabinReadings') {
        const before = existing ? existing.moduleId : row.moduleId;
        const after = op === 'delete' ? before : row.moduleId;
        if (!s.leaderModuleIds.has(before) || !s.leaderModuleIds.has(after)) return deny('Hanya pemimpin kabin yang bisa mengubah data lingkungan kabin.');
        return { ok: true, row: op === 'delete' ? null : row };
    }
    return deny('Hanya admin yang bisa mengubah data ini.');
}

function applyChanges(account, db, changes) {
    const rejected = [];
    let applied = 0;
    for (const change of changes) {
        const verdict = authorizeChange(account, db, change);
        if (!verdict.ok) {
            rejected.push({ table: change && change.table, id: change && change.row && change.row.id, op: change && change.op, reason: verdict.reason });
            continue;
        }
        const list = db[change.table];
        const idx = list.findIndex((r) => r.id === change.row.id);
        if (change.op === 'delete') list.splice(idx, 1);
        else if (change.op === 'insert') list.push(verdict.row);
        else list[idx] = verdict.row;
        applied++;
    }
    return { applied, rejected };
}

module.exports = { scopeFor, filterDb, authorizeChange, applyChanges, publicAccount };
