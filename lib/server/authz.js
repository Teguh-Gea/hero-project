// Otorisasi HERO (RBAC + isolasi cabin). SEMUA keputusan "siapa boleh apa" berasal dari file ini
// dan dari access.js yang memakainya. Role dan cabin selalu dihitung dari database di server,
// tidak pernah dari data yang dikirim client.
//
// Role efektif:
//   admin         : accounts.role === 'admin'. Bisa lebih dari satu, semua setara.
//   cabin_leader  : akun astronot yang tercatat sebagai modules.leaderAstronautId pada cabin
//                   tempat ia memang ditugaskan (assignments.quartersModuleId).
//   cabin_member  : akun astronot lainnya.
// "Cabin" di HERO = modul tempat tinggal kru (tabel modules).
import * as store from './store.js';
import * as auth from './auth.js';

export const ROLES = Object.freeze({ ADMIN: 'admin', LEADER: 'cabin_leader', MEMBER: 'cabin_member' });
export const ROLE_LABELS = { admin: 'Admin', cabin_leader: 'Pemimpin Cabin', cabin_member: 'Anggota Cabin' };
export const PORTAL_FOR_ROLE = { admin: 'admin', astronaut: 'astronot' };

// Hak per role. Admin memiliki semua hak ('*').
const PERMISSIONS = {
    admin: new Set(['*']),
    cabin_leader: new Set(['self:read', 'self:write', 'crew:read', 'cabin:read', 'cabin:write']),
    cabin_member: new Set(['self:read', 'self:write', 'crew:read', 'cabin:read'])
};

export class AuthzError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Cakupan data sebuah akun: astronot, penugasan, misi, dan cabin yang boleh disentuh.
export function scopeFor(account, db) {
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

export function effectiveRole(account, db) {
    if (!account) return null;
    if (account.role === 'admin') return ROLES.ADMIN;
    return scopeFor(account, db).leaderModuleIds.size ? ROLES.LEADER : ROLES.MEMBER;
}

function userFromAccount(session, account, db) {
    return { session, account, role: effectiveRole(account, db), scope: scopeFor(account, db) };
}

// Pengguna aktif dari ID sesi (cookie). Akun dibaca ulang dari database setiap kali,
// jadi perubahan role atau akun yang dihapus langsung berlaku.
export function getUserBySessionId(sid) {
    const s = auth.sessionById(sid);
    if (!s) return null;
    const db = store.get();
    const account = db.accounts.find((a) => a.id === s.accountId);
    return account ? userFromAccount(s, account, db) : null;
}

export function getCurrentUser(req) {
    return getUserBySessionId(auth.sessionIdFromRequest(req));
}

export function requireAuth(req) {
    const user = getCurrentUser(req);
    if (!user) throw new AuthzError(401, 'Sesi berakhir. Silakan masuk lagi.');
    return user;
}

export function requireRole(user, ...roles) {
    if (!user) throw new AuthzError(401, 'Sesi berakhir. Silakan masuk lagi.');
    if (!roles.includes(user.role)) throw new AuthzError(403, 'Anda tidak memiliki akses ke fitur ini.');
    return user;
}

export function checkPermission(user, permission) {
    if (!user) return false;
    const perms = PERMISSIONS[user.role];
    return !!perms && (perms.has('*') || perms.has(permission));
}

export function permissionsFor(role) {
    return [...(PERMISSIONS[role] || [])];
}

// Boleh membaca ('read') atau mengubah ('write') data cabin ini?
// cabinId dari client tidak pernah dipercaya: selalu dicocokkan dengan cakupan akun dari database.
export function checkCabinAccess(user, cabinId, mode = 'read') {
    if (!user || !cabinId) return false;
    if (user.role === ROLES.ADMIN) return true;
    if (mode === 'write') return checkPermission(user, 'cabin:write') && user.scope.leaderModuleIds.has(cabinId);
    return checkPermission(user, 'cabin:read') && user.scope.moduleIds.has(cabinId);
}

// Aturan perubahan role. Satu-satunya perubahan yang diizinkan: Pemimpin/Anggota Cabin -> Admin.
//   Admin -> apa pun          : ditolak (role Admin terlindungi)
//   Pemimpin <-> Anggota      : ditolak di sini; pemimpin ditentukan lewat penugasan cabin (modules)
// Mengembalikan { ok: true } atau { ok: false, status, reason }.
export function canChangeRole(actor, target, targetRole) {
    const no = (status, reason) => ({ ok: false, status, reason });
    if (!actor) return no(401, 'Sesi berakhir. Silakan masuk lagi.');
    if (actor.role !== ROLES.ADMIN) return no(403, 'Hanya Admin yang dapat mengubah role pengguna.');
    if (!target) return no(404, 'Pengguna tidak ditemukan.');
    if (target.id === actor.account.id) return no(403, 'Anda tidak dapat mengubah role akun Anda sendiri.');
    // Proteksi Admin diperiksa sebelum validasi apa pun, jadi setiap upaya menurunkan Admin selalu 403
    if (target.role === 'admin') {
        return targetRole === ROLES.ADMIN
            ? no(409, 'Pengguna ini sudah Admin.')
            : no(403, 'Role Admin terlindungi dan tidak dapat diturunkan.');
    }
    if (!Object.values(ROLES).includes(targetRole)) return no(400, 'Role tujuan tidak dikenal.');
    if (targetRole !== ROLES.ADMIN) {
        return no(403, 'Hanya pengangkatan menjadi Admin yang diizinkan. Pemimpin Cabin ditentukan lewat penugasan cabin.');
    }
    if (target.role !== 'astronaut' || !target.astronautId) return no(400, 'Akun ini tidak bisa diangkat menjadi Admin.');
    return { ok: true };
}

// Terapkan pengangkatan ke Admin pada database (dipanggil setelah canChangeRole lolos).
// Kepemimpinan cabin dilepas agar setiap cabin tetap dipimpin astronot non-Admin.
// Sinkron: tidak ada await di antara pemeriksaan dan perubahan, jadi atomik di proses Node.
export function promoteToAdmin(db, target) {
    target.role = 'admin';
    if (!target.title) target.title = 'Admin';
    const released = [];
    db.modules.forEach((m) => {
        if (target.astronautId && m.leaderAstronautId === target.astronautId) {
            m.leaderAstronautId = null;
            released.push(m.id);
        }
    });
    return { releasedCabins: released };
}

// Ringkasan pengguna untuk halaman manajemen pengguna (tanpa hash kata sandi)
export function describeUser(account, db, actor) {
    const role = effectiveRole(account, db);
    const astro = account.astronautId ? db.astronauts.find((a) => a.id === account.astronautId) : null;
    const asgModuleIds = new Set(db.assignments.filter((a) => a.astronautId === account.astronautId).map((a) => a.quartersModuleId).filter(Boolean));
    const cabins = db.modules
        .filter((m) => asgModuleIds.has(m.id))
        .map((m) => ({ id: m.id, name: m.name, missionId: m.missionId, isLeader: m.leaderAstronautId === account.astronautId }));
    const check = canChangeRole(actor, account, ROLES.ADMIN);
    return {
        id: account.id,
        email: account.email,
        name: astro ? astro.name : account.name || '',
        title: account.title || null,
        astronautId: account.astronautId || null,
        role,
        roleLabel: ROLE_LABELS[role],
        protected: role === ROLES.ADMIN,
        isSelf: !!actor && actor.account.id === account.id,
        canPromote: check.ok,
        cabins
    };
}

// Tujuan redirect untuk halaman portal (dipakai server component, sebelum HTML dikirim).
//   page 'app'   : belum masuk -> /<portal>/login, salah portal -> portal miliknya
//   page 'login' : sudah masuk -> portal miliknya
export function portalRedirect(sid, portal, page) {
    const user = getUserBySessionId(sid);
    const home = user ? `/${PORTAL_FOR_ROLE[user.account.role] || 'astronot'}` : null;
    if (page === 'login') return home;
    if (!user) return `/${portal}/login`;
    return home === `/${portal}` ? null : home;
}
