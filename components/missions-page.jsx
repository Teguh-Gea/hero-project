'use client';

import { useEffect, useState } from 'react';
import { adminApi, inputCls, btnPrimary, btnGhost, btnDanger } from './admin-api';

// Halaman Misi (khusus Admin). Satu misi = satu kabin: membuat misi otomatis membuat kabinnya,
// dan semua astronot di misi itu tinggal di kabin tersebut.
// API /api/admin/missions* menolak non-Admin (403) apa pun yang dikirim browser.

const EMPTY = { id: '', name: '', startDate: '', endDate: '', cabinName: 'Node 2 Harmony (ruang kru)' };

function MissionForm({ initial, isNew, busy, onSubmit, onCancel, T }) {
    const [f, setF] = useState(initial);
    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
    const prefix = isNew ? 'new-mission' : `edit-${initial.id}`;
    return (
        <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-stone-500" htmlFor={`${prefix}-id`}>
                {T('Kode misi', 'Mission code')}
                <input id={`${prefix}-id`} className={`${inputCls} font-mono`} value={f.id} readOnly={!isNew} onChange={set('id')} placeholder="INC-063" />
                {!isNew && <span className="text-stone-500">{T('Kode misi tidak bisa diubah.', 'The mission code cannot be changed.')}</span>}
            </label>
            <label className="grid gap-1 text-xs text-stone-500" htmlFor={`${prefix}-name`}>
                {T('Nama misi', 'Mission name')}
                <input id={`${prefix}-name`} className={inputCls} value={f.name} onChange={set('name')} placeholder={T('Ekspedisi 63', 'Expedition 63')} />
            </label>
            <label className="grid gap-1 text-xs text-stone-500" htmlFor={`${prefix}-start`}>
                {T('Tanggal mulai', 'Start date')}
                <input id={`${prefix}-start`} type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} />
            </label>
            <label className="grid gap-1 text-xs text-stone-500" htmlFor={`${prefix}-end`}>
                {T('Tanggal selesai (opsional)', 'End date (optional)')}
                <input id={`${prefix}-end`} type="date" className={inputCls} value={f.endDate || ''} onChange={set('endDate')} />
            </label>
            <label className="grid gap-1 text-xs text-stone-500 sm:col-span-2" htmlFor={`${prefix}-cabin`}>
                {T('Nama kabin misi', 'Mission cabin name')}
                <input id={`${prefix}-cabin`} className={inputCls} value={f.cabinName} onChange={set('cabinName')} />
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>
                    {busy ? T('Menyimpan…', 'Saving…') : isNew ? T('Buat misi', 'Create mission') : T('Simpan misi', 'Save mission')}
                </button>
                <button type="button" onClick={onCancel} className={btnGhost}>{T('Batal', 'Cancel')}</button>
            </div>
        </form>
    );
}

export default function MissionsPage({ isEn, onChanged }) {
    const T = (id, en) => (isEn ? en : id);
    const [missions, setMissions] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [mode, setMode] = useState(null); // null | 'new' | { edit: id } | { del: id }
    const [busy, setBusy] = useState(false);

    const load = () => adminApi('/api/admin/missions').then((r) => setMissions(r.missions)).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    const run = async (fn, message) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await fn();
            setNotice(message);
            setMode(null);
            await load();
            if (onChanged) onChanged();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };

    const create = (f) => run(
        () => adminApi('/api/admin/missions', { body: { ...f, endDate: f.endDate || null } }),
        T(`Misi ${f.id.trim().toUpperCase()} dan kabinnya dibuat.`, `Mission ${f.id.trim().toUpperCase()} and its cabin were created.`)
    );
    const update = (id, f) => run(
        () => adminApi(`/api/admin/missions/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name: f.name, startDate: f.startDate, endDate: f.endDate || null, cabinName: f.cabinName } }),
        T(`Misi ${id} disimpan.`, `Mission ${id} saved.`)
    );
    const remove = (id) => run(
        () => adminApi(`/api/admin/missions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        T(`Misi ${id} beserta kabin dan data lingkungannya dihapus.`, `Mission ${id} and its cabin and environment data were deleted.`)
    );

    return (
        <div className="max-w-[1080px] mx-auto space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-light tracking-[-0.02em] text-stone-900">{T('Misi', 'Missions')}</h1>
                    <p className="text-sm text-stone-500 mt-2 max-w-[70ch]">
                        {T('Setiap misi punya satu kabin. Astronot yang ditugaskan di misi yang sama otomatis tinggal di kabin yang sama dan bisa melihat data satu sama lain. Astronot baru harus ditugaskan ke salah satu misi di sini.',
                            'Each mission has one cabin. Astronauts assigned to the same mission share that cabin and can see each other’s data. New astronauts must be assigned to one of these missions.')}
                    </p>
                </div>
                {mode !== 'new' && <button type="button" onClick={() => { setMode('new'); setNotice(''); setError(''); }} className={btnPrimary}>{T('Tambah misi', 'Add mission')}</button>}
            </div>

            {notice && <div role="status" className="p-4 rounded-[14px] border border-emerald-500/40 bg-emerald-50 text-emerald-800 text-sm">{notice}</div>}
            {error && <div role="alert" className="p-4 rounded-[14px] border border-rose-500/40 bg-rose-950/40 text-rose-300 text-sm">{error}</div>}

            {mode === 'new' && (
                <section aria-label={T('Misi baru', 'New mission')} className="rounded-[24px] border border-seam bg-panel p-6 space-y-4">
                    <h2 className="text-lg font-medium text-stone-900">{T('Misi baru', 'New mission')}</h2>
                    <MissionForm initial={EMPTY} isNew busy={busy} onSubmit={create} onCancel={() => setMode(null)} T={T} />
                </section>
            )}

            {!missions && !error && <p role="status" className="text-sm text-stone-500">{T('Memuat misi…', 'Loading missions…')}</p>}
            {missions && missions.length === 0 && (
                <p className="rounded-[20px] border border-seam bg-panel p-6 text-sm text-stone-500">{T('Belum ada misi. Tambahkan misi pertama untuk mulai mendaftarkan astronot.', 'No missions yet. Add the first mission to start registering astronauts.')}</p>
            )}

            {missions && missions.length > 0 && (
                <ul className="grid gap-3">
                    {missions.map((m) => {
                        const editing = mode && mode.edit === m.id;
                        const deleting = mode && mode.del === m.id;
                        return (
                            <li key={m.id} className="rounded-[20px] border border-seam bg-panel p-6 space-y-4">
                                {editing ? (
                                    <MissionForm
                                        initial={{ id: m.id, name: m.name, startDate: m.startDate || '', endDate: m.endDate || '', cabinName: m.cabin ? m.cabin.name : '' }}
                                        busy={busy} onSubmit={(f) => update(m.id, f)} onCancel={() => setMode(null)} T={T} />
                                ) : (
                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                <span className="font-mono text-sm text-stone-900">{m.id}</span>
                                                <span className="text-lg text-stone-900">{m.name}</span>
                                            </div>
                                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                                <div><dt className="text-xs text-stone-500">{T('Mulai', 'Start')}</dt><dd className="font-mono text-stone-800">{m.startDate || '–'}</dd></div>
                                                <div><dt className="text-xs text-stone-500">{T('Selesai', 'End')}</dt><dd className="font-mono text-stone-800">{m.endDate || '–'}</dd></div>
                                                <div><dt className="text-xs text-stone-500">{T('Kabin', 'Cabin')}</dt><dd className="text-stone-800">{m.cabin ? m.cabin.name : T('Belum ada', 'None')}</dd></div>
                                                <div><dt className="text-xs text-stone-500">{T('Pemimpin kabin', 'Cabin leader')}</dt><dd className="text-stone-800">{m.cabin && m.cabin.leaderName ? m.cabin.leaderName : T('Belum ditunjuk', 'Not set')}</dd></div>
                                            </dl>
                                            <p className="text-xs text-stone-500">
                                                {m.crewCount
                                                    ? T(`${m.crewCount} astronot: `, `${m.crewCount} astronauts: `) + m.crew.map((c) => c.name).join(', ')
                                                    : T('Belum ada astronot.', 'No astronauts yet.')}
                                            </p>
                                        </div>
                                        {!deleting && (
                                            <div className="flex flex-wrap gap-2 md:justify-end">
                                                <button type="button" onClick={() => { setMode({ edit: m.id }); setNotice(''); setError(''); }} className={btnGhost}>{T('Ubah', 'Edit')}</button>
                                                <button type="button" onClick={() => { setMode({ del: m.id }); setNotice(''); setError(''); }} className={btnDanger}>{T('Hapus', 'Delete')}</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {deleting && (
                                    <div role="group" aria-label={T('Konfirmasi hapus', 'Confirm delete')} className="rounded-[14px] border border-rose-500/40 bg-rose-50 p-4 space-y-3">
                                        {m.crewCount ? (
                                            <>
                                                <p className="text-sm text-rose-800">
                                                    {T(`Misi ${m.id} masih punya ${m.crewCount} astronot. Pindahkan atau hapus penugasan mereka di Simulasi input dulu, agar data kesehatan mereka tidak ikut terhapus.`,
                                                        `Mission ${m.id} still has ${m.crewCount} astronauts. Move or remove their assignments in Input simulator first, so their health data is not lost.`)}
                                                </p>
                                                <button type="button" onClick={() => setMode(null)} className={btnGhost}>{T('Tutup', 'Close')}</button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-sm text-rose-800">
                                                    {T(`Hapus misi ${m.id}? Kabin dan semua data lingkungan kabinnya ikut terhapus. Ini tidak bisa dibatalkan.`,
                                                        `Delete mission ${m.id}? Its cabin and all cabin environment data are deleted too. This cannot be undone.`)}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" disabled={busy} onClick={() => remove(m.id)} className="h-11 px-5 rounded-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium">
                                                        {busy ? T('Menghapus…', 'Deleting…') : T(`Hapus misi ${m.id}`, `Delete mission ${m.id}`)}
                                                    </button>
                                                    <button type="button" onClick={() => setMode(null)} className={btnGhost}>{T('Batal', 'Cancel')}</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
