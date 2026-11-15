import * as store from '../../../../../../lib/server/store.js';
import { setCabinLeader, missionSummary } from '../../../../../../lib/server/missions.js';
import { handler, json, readJson } from '../../../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tunjuk/ganti Pemimpin Cabin misi ini: { astronautId: 'AST-0038' } atau { astronautId: null }.
// Khusus Admin. Role Pemimpin/Anggota Cabin dihitung ulang di server pada permintaan berikutnya.
export const PUT = handler(async ({ req, params }) => {
    const body = await readJson(req);
    const db = store.get();
    const r = setCabinLeader(db, params.id, body.astronautId || null);
    if (!r.ok) return json(r.status, { error: r.error });
    await store.save();
    return json(200, { mission: missionSummary(db, r.mission), previous: r.previous, leader: r.leader });
}, { roles: ['admin'] });
