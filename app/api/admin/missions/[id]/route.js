import * as store from '../../../../../lib/server/store.js';
import { updateMission, deleteMission, missionSummary } from '../../../../../lib/server/missions.js';
import { handler, json, readJson } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ubah nama, tanggal, atau nama kabin misi: { name?, startDate?, endDate?, cabinName? }
export const PATCH = handler(async ({ req, params }) => {
    const body = await readJson(req);
    const db = store.get();
    const r = updateMission(db, params.id, body);
    if (!r.ok) return json(r.status, { error: r.error });
    await store.save();
    return json(200, { mission: missionSummary(db, r.mission) });
}, { roles: ['admin'] });

// Hapus misi kosong beserta kabin dan data lingkungan kabinnya (409 jika masih ada astronot)
export const DELETE = handler(async ({ params }) => {
    const db = store.get();
    const r = deleteMission(db, params.id);
    if (!r.ok) return json(r.status, { error: r.error });
    await store.save();
    return json(200, { ok: true, removedCabins: r.removedCabins, removedReadings: r.removedReadings });
}, { roles: ['admin'] });
