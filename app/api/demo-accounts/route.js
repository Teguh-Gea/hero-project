import * as store from '../../../lib/server/store.js';
import { handler, json, SHOW_DEMO, PORTAL_ROLE } from '../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar akun demo untuk halaman login (mati jika HERO_DEMO=0)
export const GET = handler(async ({ url }) => {
    if (!SHOW_DEMO) return json(200, { accounts: [] });
    const db = store.get();
    const role = PORTAL_ROLE[url.searchParams.get('portal')] || 'astronaut';
    return json(200, {
        accounts: db.accounts.filter((a) => a.role === role).map((a) => {
            const astro = a.astronautId ? db.astronauts.find((x) => x.id === a.astronautId) : null;
            const leader = a.astronautId && db.modules.some((m) => m.leaderAstronautId === a.astronautId);
            return { email: a.email, name: astro ? astro.name : a.name, leader };
        }),
        password: 'password123'
    });
});
