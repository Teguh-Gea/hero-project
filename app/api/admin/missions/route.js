import * as store from '../../../../lib/server/store.js';
import { createMission, missionSummary } from '../../../../lib/server/missions.js';
import { handler, json, readJson } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daftar misi beserta kabin dan krunya (khusus Admin)
export const GET = handler(async () => {
    const db = store.get();
    return json(200, { missions: db.missions.map((m) => missionSummary(db, m)) });
}, { roles: ['admin'] });

// Buat misi baru beserta kabinnya: { id, name, startDate, endDate?, cabinName? }
export const POST = handler(async ({ req }) => {
    const body = await readJson(req);
    const db = store.get();
    const r = createMission(db, body);
    if (!r.ok) return json(r.status, { error: r.error });
    await store.save();
    return json(201, { mission: missionSummary(db, r.mission) });
}, { roles: ['admin'] });
