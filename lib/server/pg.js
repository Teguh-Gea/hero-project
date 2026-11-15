// Koneksi Postgres (Neon) untuk deploy di Vercel.
// Aktif otomatis jika DATABASE_URL (atau POSTGRES_URL) ada; tanpa itu HERO memakai file data/hero-db.json
// dan sesi di memori (cocok untuk `npm run dev` di komputer sendiri).
//
// Semua SQL ada di sini, dipanggil lewat nama (q('stateGet')). Uji otomatis memasang database tiruan
// lewat globalThis.__heroPgFactory yang menjalankan perintah yang sama berdasarkan namanya.

// DATABASE_URL dari integrasi Neon di Vercel. Jika saat menghubungkan database Anda memberi
// awalan (prefix) lain, mis. STORAGE_DATABASE_URL atau HERO_POSTGRES_URL, itu juga dikenali.
export function databaseUrl() {
    const env = process.env;
    if (env.DATABASE_URL) return env.DATABASE_URL;
    if (env.POSTGRES_URL) return env.POSTGRES_URL;
    const keys = Object.keys(env);
    const key = keys.find((k) => /_DATABASE_URL$/.test(k) && env[k])
        || keys.find((k) => /_POSTGRES_URL$/.test(k) && env[k])
        || keys.find((k) => /DATABASE_URL_UNPOOLED$/.test(k) && env[k]);
    return key ? env[key] : '';
}

export function usePostgres() {
    return !!databaseUrl();
}

// Satu tabel berisi seluruh data HERO sebagai JSONB (baris id = 1) dengan nomor versi untuk
// optimistic locking, ditambah tabel sesi login dan batas percobaan login.
const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS hero_state (
        id integer PRIMARY KEY,
        version integer NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS hero_sessions (
        sid_hash text PRIMARY KEY,
        account_id text NOT NULL,
        expires_at timestamptz NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS hero_sessions_account_idx ON hero_sessions (account_id)',
    `CREATE TABLE IF NOT EXISTS hero_login_attempts (
        ip text PRIMARY KEY,
        count integer NOT NULL,
        reset_at timestamptz NOT NULL
    )`
];

export const SQL = {
    stateGet: 'SELECT version, data FROM hero_state WHERE id = 1',
    stateInsert: 'INSERT INTO hero_state (id, version, data) VALUES (1, 1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
    // Hanya berhasil jika versinya masih sama dengan saat dibaca (tidak ada penulis lain di antaranya)
    stateUpdate: 'UPDATE hero_state SET data = $1::jsonb, version = version + 1, updated_at = now() WHERE id = 1 AND version = $2::integer RETURNING version',
    stateOverwrite: 'UPDATE hero_state SET data = $1::jsonb, version = version + 1, updated_at = now() WHERE id = 1 RETURNING version',

    sessionInsert: 'INSERT INTO hero_sessions (sid_hash, account_id, expires_at) VALUES ($1, $2, $3::timestamptz)',
    // Ambil sesi yang masih berlaku sekaligus memperpanjangnya
    sessionTouch: 'UPDATE hero_sessions SET expires_at = $2::timestamptz WHERE sid_hash = $1 AND expires_at > now() RETURNING account_id',
    sessionDelete: 'DELETE FROM hero_sessions WHERE sid_hash = $1',
    sessionDeleteAccount: 'DELETE FROM hero_sessions WHERE account_id = $1 AND sid_hash <> $2',
    sessionPurge: 'DELETE FROM hero_sessions WHERE expires_at <= now()',

    attemptGet: 'SELECT count FROM hero_login_attempts WHERE ip = $1 AND reset_at > now()',
    attemptFail: `INSERT INTO hero_login_attempts (ip, count, reset_at) VALUES ($1, 1, now() + interval '10 minutes')
        ON CONFLICT (ip) DO UPDATE SET
            count = CASE WHEN hero_login_attempts.reset_at > now() THEN hero_login_attempts.count + 1 ELSE 1 END,
            reset_at = CASE WHEN hero_login_attempts.reset_at > now() THEN hero_login_attempts.reset_at ELSE now() + interval '10 minutes' END`,
    attemptClear: 'DELETE FROM hero_login_attempts WHERE ip = $1'
};

const state = (globalThis.__heroPg ??= { client: null, schema: null });

async function client() {
    if (!state.client) {
        state.client = globalThis.__heroPgFactory
            ? Promise.resolve(globalThis.__heroPgFactory())
            : import('@neondatabase/serverless').then(({ neon }) => neon(databaseUrl()));
        state.client.catch(() => { state.client = null; });
    }
    return state.client;
}

async function raw(text, params, name) {
    const sql = await client();
    if (sql.run) return sql.run(name, params);    // database tiruan untuk uji
    return sql.query(text, params);
}

// Buat tabel (sekali per instance server)
export async function ensureSchema() {
    if (!state.schema) {
        state.schema = (async () => {
            for (let i = 0; i < SCHEMA.length; i++) await raw(SCHEMA[i], [], `schema${i}`);
        })();
        state.schema.catch(() => { state.schema = null; });
    }
    return state.schema;
}

export async function q(name, params = []) {
    await ensureSchema();
    return raw(SQL[name], params, name);
}
