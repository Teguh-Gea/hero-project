// Misi & kabin. Di HERO satu misi selalu punya tepat satu kabin (modules), dan semua astronot
// yang ditugaskan di misi itu tinggal di kabin tersebut: semisi = sekabin.
// Misi dan kabinnya hanya dibuat/diubah/dihapus lewat fungsi di sini (dipanggil /api/admin/missions).

export const DEFAULT_CABIN_NAME = 'Node 2 Harmony (ruang kru)';
const ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,23}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fail = (status, error) => ({ ok: false, status, error });

function validDate(v) {
    if (!DATE_PATTERN.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Bersihkan & periksa isian misi. `current` diisi saat mengubah misi yang sudah ada.
function cleanInput(input, current) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    if (!current) {
        out.id = String(src.id || '').trim().toUpperCase();
        if (!ID_PATTERN.test(out.id)) return fail(400, 'Kode misi 2–24 karakter, hanya huruf, angka, dan tanda hubung (contoh INC-063).');
    }
    if (!current || src.name !== undefined) {
        out.name = String(src.name || '').trim();
        if (!out.name || out.name.length > 80) return fail(400, 'Nama misi wajib diisi (maksimal 80 karakter).');
    }
    if (!current || src.startDate !== undefined) {
        out.startDate = String(src.startDate || '').trim();
        if (!validDate(out.startDate)) return fail(400, 'Tanggal mulai misi wajib diisi (format YYYY-MM-DD).');
    }
    if (src.endDate !== undefined) {
        out.endDate = src.endDate ? String(src.endDate).trim() : null;
        if (out.endDate && !validDate(out.endDate)) return fail(400, 'Tanggal selesai misi tidak valid (format YYYY-MM-DD).');
    }
    if (src.cabinName !== undefined) {
        out.cabinName = String(src.cabinName || '').trim() || DEFAULT_CABIN_NAME;
        if (out.cabinName.length > 80) return fail(400, 'Nama kabin maksimal 80 karakter.');
    }
    const start = out.startDate ?? (current && current.startDate);
    const end = out.endDate !== undefined ? out.endDate : current && current.endDate;
    if (start && end && end < start) return fail(400, 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
    return { ok: true, value: out };
}

export function missionSummary(db, mission) {
    const cabin = db.modules.find((m) => m.missionId === mission.id) || null;
    const crew = db.assignments.filter((a) => a.missionId === mission.id);
    const leader = cabin && cabin.leaderAstronautId ? db.astronauts.find((a) => a.id === cabin.leaderAstronautId) : null;
    return {
        ...mission,
        cabin: cabin ? { id: cabin.id, name: cabin.name, leaderAstronautId: cabin.leaderAstronautId || null, leaderName: leader ? leader.name : null } : null,
        crewCount: crew.length,
        crew: crew.map((a) => {
            const astro = db.astronauts.find((x) => x.id === a.astronautId);
            return { astronautId: a.astronautId, name: astro ? astro.name : a.astronautId };
        })
    };
}

export function createMission(db, input) {
    const c = cleanInput(input, null);
    if (!c.ok) return c;
    const { id, name, startDate, endDate = null, cabinName = DEFAULT_CABIN_NAME } = c.value;
    if (db.missions.some((m) => m.id === id)) return fail(409, `Misi ${id} sudah ada.`);
    const cabinId = `${id}-N2`;
    if (db.modules.some((m) => m.id === cabinId || m.missionId === id)) return fail(409, `Kabin untuk misi ${id} sudah ada.`);
    const mission = { id, name, vehicle: 'ISS', startDate, endDate };
    db.missions.push(mission);
    db.modules.push({ id: cabinId, missionId: id, name: cabinName, leaderAstronautId: null });
    return { ok: true, mission };
}

export function updateMission(db, missionId, input) {
    const mission = db.missions.find((m) => m.id === missionId);
    if (!mission) return fail(404, 'Misi tidak ditemukan.');
    if (input && input.id !== undefined && String(input.id).trim().toUpperCase() !== missionId) {
        return fail(400, 'Kode misi tidak bisa diubah. Buat misi baru jika kodenya berbeda.');
    }
    const c = cleanInput(input, mission);
    if (!c.ok) return c;
    const { cabinName, ...fields } = c.value;
    Object.assign(mission, fields);
    if (cabinName !== undefined) {
        let cabin = db.modules.find((m) => m.missionId === missionId);
        if (!cabin) {
            cabin = { id: `${missionId}-N2`, missionId, name: cabinName, leaderAstronautId: null };
            db.modules.push(cabin);
        }
        else cabin.name = cabinName;
    }
    return { ok: true, mission };
}

// Misi yang masih punya astronot tidak bisa dihapus (data kesehatan mereka terkait ke penugasan itu).
// Misi kosong dihapus bersama kabin dan data lingkungan kabinnya.
export function deleteMission(db, missionId) {
    const mission = db.missions.find((m) => m.id === missionId);
    if (!mission) return fail(404, 'Misi tidak ditemukan.');
    const crew = db.assignments.filter((a) => a.missionId === missionId);
    if (crew.length) {
        return fail(409, `Misi ${missionId} masih punya ${crew.length} astronot. Pindahkan atau hapus penugasan mereka dulu.`);
    }
    const cabinIds = new Set(db.modules.filter((m) => m.missionId === missionId).map((m) => m.id));
    const removedReadings = db.cabinReadings.filter((r) => cabinIds.has(r.moduleId)).length;
    db.cabinReadings = db.cabinReadings.filter((r) => !cabinIds.has(r.moduleId));
    db.modules = db.modules.filter((m) => !cabinIds.has(m.id));
    db.missions = db.missions.filter((m) => m.id !== missionId);
    return { ok: true, removedCabins: [...cabinIds], removedReadings };
}
