// Database Postgres tiruan (di memori) untuk uji otomatis mode Postgres tanpa server Postgres.
// Menjalankan perintah yang sama dengan lib/server/pg.js berdasarkan namanya, dengan perilaku yang sama:
// optimistic locking pada hero_state, sesi yang kedaluwarsa, dan batas percobaan login.
// Setiap perintah menunggu satu putaran event loop agar permintaan bersamaan benar-benar saling menyela.
export function createFakePg() {
    const db = { state: null, sessions: new Map(), attempts: new Map(), log: [] };
    const now = () => Date.now();
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const ops = {
        stateGet: () => (db.state ? [{ version: db.state.version, data: clone(db.state.data) }] : []),
        stateInsert: ([json]) => { if (!db.state) db.state = { version: 1, data: JSON.parse(json) }; return []; },
        stateUpdate: ([json, v]) => {
            if (!db.state || db.state.version !== Number(v)) return [];
            db.state = { version: db.state.version + 1, data: JSON.parse(json) };
            return [{ version: db.state.version }];
        },
        stateOverwrite: ([json]) => {
            if (!db.state) return [];
            db.state = { version: db.state.version + 1, data: JSON.parse(json) };
            return [{ version: db.state.version }];
        },
        sessionInsert: ([h, accountId, iso]) => { db.sessions.set(h, { accountId, expires: Date.parse(iso) }); return []; },
        sessionTouch: ([h, iso]) => {
            const s = db.sessions.get(h);
            if (!s || s.expires <= now()) return [];
            s.expires = Date.parse(iso);
            return [{ account_id: s.accountId }];
        },
        sessionDelete: ([h]) => { db.sessions.delete(h); return []; },
        sessionDeleteAccount: ([accountId, keep]) => {
            for (const [h, s] of db.sessions) if (s.accountId === accountId && h !== keep) db.sessions.delete(h);
            return [];
        },
        sessionPurge: () => { for (const [h, s] of db.sessions) if (s.expires <= now()) db.sessions.delete(h); return []; },
        attemptGet: ([ip]) => { const a = db.attempts.get(ip); return a && a.reset > now() ? [{ count: a.count }] : []; },
        attemptFail: ([ip]) => {
            const a = db.attempts.get(ip);
            if (a && a.reset > now()) a.count++;
            else db.attempts.set(ip, { count: 1, reset: now() + 10 * 60 * 1000 });
            return [];
        },
        attemptClear: ([ip]) => { db.attempts.delete(ip); return []; }
    };
    return {
        db,
        async run(name, params) {
            await new Promise((r) => setImmediate(r));
            db.log.push(name);
            if (name.startsWith('schema')) return [];
            if (!ops[name]) throw new Error(`Perintah SQL tidak dikenal: ${name}`);
            return ops[name](params);
        }
    };
}
