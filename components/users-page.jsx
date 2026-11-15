'use client';

import { useEffect, useState } from 'react';

// Halaman manajemen pengguna (khusus Admin).
// Tampilan ini hanya untuk UX: API /api/admin/users* menolak non-Admin (403) dan
// menolak penurunan role Admin, apa pun yang dikirim dari browser.

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', 'X-HERO-Request': '1' } : {},
        body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* respons tanpa JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Server membalas ${res.status}.`);
    return data;
}

const ROLE_TEXT = {
    admin: ['Admin', 'Admin'],
    cabin_leader: ['Pemimpin Cabin', 'Cabin leader'],
    cabin_member: ['Anggota Cabin', 'Cabin member']
};

function RoleBadge({ role, isEn }) {
    const cls = role === 'admin'
        ? 'border-signal/40 text-signal'
        : role === 'cabin_leader' ? 'border-sky-500/40 text-sky-300' : 'border-stone-300 text-stone-600';
    return <span className={`inline-flex items-center h-7 px-3 rounded-full border text-xs font-medium ${cls}`}>{ROLE_TEXT[role][isEn ? 1 : 0]}</span>;
}

export default function UsersPage({ isEn, onPromoted }) {
    const T = (id, en) => (isEn ? en : id);
    const [users, setUsers] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmId, setConfirmId] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = () => api('/api/admin/users').then((r) => setUsers(r.users)).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    const promote = async (u) => {
        setBusyId(u.id);
        setError('');
        setNotice('');
        try {
            const r = await api(`/api/admin/users/${encodeURIComponent(u.id)}/role`, { role: 'admin' });
            const released = r.releasedCabins.length
                ? T(` Kepemimpinan di ${r.releasedCabins.join(', ')} dilepas; tunjuk pemimpin baru di Simulasi input.`,
                    ` Leadership of ${r.releasedCabins.join(', ')} was released; pick a new leader in Input simulator.`)
                : '';
            setNotice(T(`${u.name} sekarang Admin dan masuk lewat portal admin.`, `${u.name} is now an Admin and signs in through the admin portal.`) + released);
            setConfirmId(null);
            await load();
            if (onPromoted) onPromoted();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusyId(null);
        }
    };

    const admins = users ? users.filter((u) => u.role === 'admin').length : 0;

    return (
        <div className="max-w-[1080px] mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-light tracking-[-0.02em] text-stone-900">{T('Pengguna', 'Users')}</h1>
                <p className="text-sm text-stone-500 mt-2 max-w-[70ch]">
                    {T('Admin bisa mengangkat Pemimpin Cabin atau Anggota Cabin menjadi Admin. Role Admin terlindungi: tidak ada Admin yang bisa diturunkan, dihapus, atau diubah akunnya oleh Admin lain. Pemimpin Cabin ditentukan per cabin di Simulasi input → Profil & penugasan.',
                        'Admins can promote cabin leaders or cabin members to Admin. The Admin role is protected: no Admin can be demoted, deleted, or edited by another Admin. Cabin leaders are set per cabin in Input simulator → Profile & assignment.')}
                </p>
            </div>

            {notice && <div role="status" className="p-4 rounded-[14px] border border-emerald-500/40 bg-emerald-50 text-emerald-800 text-sm">{notice}</div>}
            {error && <div role="alert" className="p-4 rounded-[14px] border border-rose-500/40 bg-rose-950/40 text-rose-300 text-sm">{error}</div>}

            {!users && !error && <p role="status" className="text-sm text-stone-500">{T('Memuat pengguna…', 'Loading users…')}</p>}

            {users && (
                <div className="rounded-[24px] border border-seam bg-panel overflow-hidden">
                    <div className="px-6 py-4 border-b border-seam text-xs text-stone-500">
                        {T(`${users.length} pengguna · ${admins} Admin`, `${users.length} users · ${admins} Admins`)}
                    </div>
                    <ul className="divide-y divide-seam">
                        {users.map((u) => (
                            <li key={u.id} className="px-6 py-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-stone-900 truncate">
                                        {u.name || u.email}
                                        {u.isSelf && <span className="text-stone-500 font-normal"> · {T('Anda', 'You')}</span>}
                                    </div>
                                    <div className="text-xs text-stone-500 truncate">{u.email}{u.astronautId ? ` · ${u.astronautId}` : ''}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <RoleBadge role={u.role} isEn={isEn} />
                                    {u.cabins.map((c) => (
                                        <span key={c.id} className="text-xs text-stone-500">
                                            {c.id}{c.isLeader ? T(' (pemimpin)', ' (leader)') : ''}
                                        </span>
                                    ))}
                                </div>
                                <div className="md:justify-self-end">
                                    {u.protected ? (
                                        <span className="text-xs text-stone-500">{T('Role terlindungi', 'Protected role')}</span>
                                    ) : u.canPromote && confirmId !== u.id ? (
                                        <button type="button" onClick={() => { setConfirmId(u.id); setNotice(''); setError(''); }}
                                            className="h-11 px-5 rounded-full border border-stone-300 text-sm text-stone-900 hover:border-stone-500">
                                            {T('Jadikan Admin', 'Make Admin')}
                                        </button>
                                    ) : null}
                                </div>
                                {confirmId === u.id && (
                                    <div role="group" aria-label={T('Konfirmasi', 'Confirm')} className="md:col-span-3 rounded-[14px] border border-amber-500/40 bg-amber-50 p-4 space-y-3">
                                        <p className="text-sm text-amber-800">
                                            {T(`Angkat ${u.name} menjadi Admin? Ia akan mendapat akses penuh ke semua cabin, dan role Admin tidak bisa diturunkan lagi.`,
                                                `Promote ${u.name} to Admin? They will get full access to every cabin, and the Admin role cannot be reverted.`)}
                                            {u.role === 'cabin_leader' && T(' Kepemimpinan cabinnya akan dilepas.', ' Their cabin leadership will be released.')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" disabled={busyId === u.id} onClick={() => promote(u)}
                                                className="h-11 px-5 rounded-full bg-signal hover:bg-signal-soft disabled:opacity-50 text-ink text-sm font-medium">
                                                {busyId === u.id ? T('Menyimpan…', 'Saving…') : T(`Jadikan ${u.name} Admin`, `Make ${u.name} Admin`)}
                                            </button>
                                            <button type="button" onClick={() => setConfirmId(null)}
                                                className="h-11 px-5 rounded-full border border-stone-300 text-sm text-stone-900 hover:border-stone-500">
                                                {T('Batal', 'Cancel')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
