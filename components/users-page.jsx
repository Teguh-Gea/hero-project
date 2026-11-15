'use client';

import { useEffect, useState } from 'react';
import { adminApi, inputCls, btnPrimary, btnGhost, btnDanger } from './admin-api';
import { passwordProblem, passwordMessage, PASSWORD_HINT, EMAIL_PATTERN } from '../lib/password-policy';

// Halaman manajemen pengguna (khusus Admin): tambah, ubah, hapus akun, dan angkat menjadi Admin.
// Tampilan ini hanya untuk UX: API /api/admin/users* menolak non-Admin (403), menolak perubahan
// pada Admin lain, dan memvalidasi email & kata sandi dengan aturan yang sama (lib/password-policy.js).

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

// Isian dengan label, pesan error, dan petunjuk
function Input({ id, label, error, hint, ...props }) {
    return (
        <div className="grid gap-1">
            <label htmlFor={id} className="text-xs text-stone-500">{label}</label>
            <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
                className={`${inputCls} ${error ? 'border-rose-400' : ''}`} {...props} />
            {error ? <p id={`${id}-err`} className="text-xs text-rose-400">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-stone-500">{hint}</p> : null}
        </div>
    );
}

// Validasi isian akun di browser (server memeriksa ulang dengan aturan yang sama)
function validate(f, { requirePassword, isEn, needName }) {
    const errors = {};
    const email = String(f.email || '').trim().toLowerCase();
    if (!email) errors.email = isEn ? 'Enter an email.' : 'Isi email.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = isEn ? 'Invalid email format.' : 'Format email tidak valid.';
    if (needName && !String(f.name || '').trim()) errors.name = isEn ? 'Enter a name.' : 'Isi nama.';
    if (requirePassword || f.password || f.passwordConfirm) {
        const code = passwordProblem(f.password, { email, confirm: f.passwordConfirm });
        if (code) errors[code === 'mismatch' ? 'passwordConfirm' : 'password'] = passwordMessage(code, isEn);
    }
    return errors;
}

function CreateForm({ astronautsWithoutAccount, busy, onSubmit, onCancel, isEn, T }) {
    const [f, setF] = useState({ kind: 'admin', name: '', title: '', astronautId: '', email: '', password: '', passwordConfirm: '' });
    const [errors, setErrors] = useState({});
    const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })); };
    const submit = (e) => {
        e.preventDefault();
        const errs = validate(f, { requirePassword: true, isEn, needName: f.kind === 'admin' });
        if (f.kind === 'astronaut' && !f.astronautId) errs.astronautId = T('Pilih astronot.', 'Choose an astronaut.');
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const { passwordConfirm, ...body } = f;
        onSubmit(body);
    };
    return (
        <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <fieldset className="sm:col-span-2 flex flex-wrap gap-2">
                <legend className="text-xs text-stone-500 mb-2">{T('Jenis akun', 'Account type')}</legend>
                {[['admin', T('Admin baru', 'New Admin')], ['astronaut', T('Akun untuk astronot', 'Account for an astronaut')]].map(([k, label]) => (
                    <label key={k} className={`h-11 px-4 rounded-full border text-sm flex items-center gap-2 cursor-pointer ${f.kind === k ? 'border-signal text-stone-900' : 'border-stone-300 text-stone-600'}`}>
                        <input type="radio" name="kind" value={k} checked={f.kind === k} onChange={set('kind')} className="accent-[var(--color-signal)]" />
                        {label}
                    </label>
                ))}
            </fieldset>
            {f.kind === 'admin' ? (
                <>
                    <Input id="new-name" label={T('Nama', 'Name')} value={f.name} onChange={set('name')} error={errors.name} autoComplete="off" />
                    <Input id="new-title" label={T('Jabatan (opsional)', 'Title (optional)')} value={f.title} onChange={set('title')} placeholder="Flight Surgeon" />
                </>
            ) : (
                <div className="grid gap-1 sm:col-span-2">
                    <label htmlFor="new-astro" className="text-xs text-stone-500">{T('Astronot', 'Astronaut')}</label>
                    <select id="new-astro" value={f.astronautId} onChange={set('astronautId')} aria-invalid={!!errors.astronautId} className={`${inputCls} ${errors.astronautId ? 'border-rose-400' : ''}`}>
                        <option value="">{T('Pilih astronot tanpa akun…', 'Choose an astronaut without an account…')}</option>
                        {astronautsWithoutAccount.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                    </select>
                    {errors.astronautId && <p className="text-xs text-rose-400">{errors.astronautId}</p>}
                    {!astronautsWithoutAccount.length && <p className="text-xs text-stone-500">{T('Semua astronot sudah punya akun. Astronot baru didaftarkan di menu Kru.', 'Every astronaut already has an account. New astronauts are registered in Crew.')}</p>}
                </div>
            )}
            <div className="sm:col-span-2">
                <Input id="new-email" type="email" label="Email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="off" />
            </div>
            <Input id="new-pass" type="password" label={T('Kata sandi', 'Password')} value={f.password} onChange={set('password')} error={errors.password} hint={T(PASSWORD_HINT[0], PASSWORD_HINT[1])} autoComplete="new-password" />
            <Input id="new-pass2" type="password" label={T('Ulangi kata sandi', 'Repeat password')} value={f.passwordConfirm} onChange={set('passwordConfirm')} error={errors.passwordConfirm} autoComplete="new-password" />
            <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? T('Menyimpan…', 'Saving…') : T('Buat akun', 'Create account')}</button>
                <button type="button" onClick={onCancel} className={btnGhost}>{T('Batal', 'Cancel')}</button>
            </div>
        </form>
    );
}

function EditForm({ user, busy, onSubmit, onCancel, isEn, T }) {
    const isAdminSelf = user.role === 'admin';
    const [f, setF] = useState({ email: user.email, name: user.name, title: user.title || '', password: '', passwordConfirm: '' });
    const [errors, setErrors] = useState({});
    const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: '' })); };
    const submit = (e) => {
        e.preventDefault();
        const errs = validate(f, { requirePassword: false, isEn, needName: isAdminSelf });
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const body = { email: f.email };
        if (isAdminSelf) Object.assign(body, { name: f.name, title: f.title });
        if (f.password) body.password = f.password;
        onSubmit(body);
    };
    const p = `edit-${user.id}`;
    return (
        <form noValidate onSubmit={submit} className="md:col-span-3 grid gap-4 sm:grid-cols-2 rounded-[14px] border border-seam bg-well p-4">
            {isAdminSelf && (
                <>
                    <Input id={`${p}-name`} label={T('Nama', 'Name')} value={f.name} onChange={set('name')} error={errors.name} />
                    <Input id={`${p}-title`} label={T('Jabatan', 'Title')} value={f.title} onChange={set('title')} />
                </>
            )}
            <div className="sm:col-span-2">
                <Input id={`${p}-email`} type="email" label="Email" value={f.email} onChange={set('email')} error={errors.email} />
            </div>
            <Input id={`${p}-pass`} type="password" label={T('Kata sandi baru (kosongkan jika tetap)', 'New password (leave empty to keep)')} value={f.password} onChange={set('password')} error={errors.password} hint={T(PASSWORD_HINT[0], PASSWORD_HINT[1])} autoComplete="new-password" />
            <Input id={`${p}-pass2`} type="password" label={T('Ulangi kata sandi baru', 'Repeat new password')} value={f.passwordConfirm} onChange={set('passwordConfirm')} error={errors.passwordConfirm} autoComplete="new-password" />
            {!isAdminSelf && <p className="sm:col-span-2 text-xs text-stone-500">{T('Nama astronot diubah di Simulasi input → Profil. Mengganti kata sandi mengeluarkan pengguna ini dari semua perangkat.', 'The astronaut’s name is edited in Input simulator → Profile. Changing the password signs this user out everywhere.')}</p>}
            <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? T('Menyimpan…', 'Saving…') : T('Simpan akun', 'Save account')}</button>
                <button type="button" onClick={onCancel} className={btnGhost}>{T('Batal', 'Cancel')}</button>
            </div>
        </form>
    );
}

export default function UsersPage({ isEn, onPromoted }) {
    const T = (id, en) => (isEn ? en : id);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [mode, setMode] = useState(null); // null | 'new' | { edit|del|promote: id }
    const [busy, setBusy] = useState(false);

    const load = () => adminApi('/api/admin/users').then(setData).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    const run = async (fn, message) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const r = await fn();
            setNotice(typeof message === 'function' ? message(r) : message);
            setMode(null);
            await load();
            if (onPromoted) onPromoted();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };

    const promote = (u) => run(
        () => adminApi(`/api/admin/users/${encodeURIComponent(u.id)}/role`, { body: { role: 'admin' } }),
        (r) => T(`${u.name} sekarang Admin dan masuk lewat portal admin.`, `${u.name} is now an Admin and signs in through the admin portal.`) + (r.releasedCabins.length
            ? T(` Kepemimpinan di ${r.releasedCabins.join(', ')} dilepas; tunjuk pemimpin baru di menu Misi.`, ` Leadership of ${r.releasedCabins.join(', ')} was released; pick a new leader in Missions.`)
            : '')
    );
    const create = (body) => run(
        () => adminApi('/api/admin/users', { body }),
        (r) => T(`Akun ${r.user.email} dibuat.`, `Account ${r.user.email} created.`)
    );
    const update = (u, body) => run(
        () => adminApi(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: 'PATCH', body }),
        T(`Akun ${u.name || u.email} disimpan.`, `Account ${u.name || u.email} saved.`)
    );
    const remove = (u) => run(
        () => adminApi(`/api/admin/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' }),
        T(`Akun ${u.email} dihapus. Profil & data kesehatan astronotnya tetap ada.`, `Account ${u.email} deleted. The astronaut’s profile and health data are kept.`)
    );
    const open = (m) => { setMode(m); setNotice(''); setError(''); };

    const users = data ? data.users : null;
    const admins = users ? users.filter((u) => u.role === 'admin').length : 0;

    return (
        <div className="max-w-[1080px] mx-auto space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-light tracking-[-0.02em] text-stone-900">{T('Pengguna', 'Users')}</h1>
                    <p className="text-sm text-stone-500 mt-2 max-w-[70ch]">
                        {T('Tambah, ubah, dan hapus akun, atau angkat Pemimpin/Anggota Cabin menjadi Admin. Role Admin terlindungi: Admin lain tidak bisa diturunkan, dihapus, atau diubah akunnya. Pemimpin Cabin ditunjuk per kabin di menu Misi → Ganti pemimpin.',
                            'Add, edit and delete accounts, or promote cabin leaders and members to Admin. The Admin role is protected: other Admins cannot be demoted, deleted or edited. Cabin leaders are set per cabin in Missions → Change leader.')}
                    </p>
                </div>
                {users && mode !== 'new' && <button type="button" onClick={() => open('new')} className={btnPrimary}>{T('Tambah akun', 'Add account')}</button>}
            </div>

            {notice && <div role="status" className="p-4 rounded-[14px] border border-emerald-500/40 bg-emerald-50 text-emerald-800 text-sm">{notice}</div>}
            {error && <div role="alert" className="p-4 rounded-[14px] border border-rose-500/40 bg-rose-950/40 text-rose-300 text-sm">{error}</div>}

            {mode === 'new' && data && (
                <section aria-label={T('Akun baru', 'New account')} className="rounded-[24px] border border-seam bg-panel p-6 space-y-4">
                    <h2 className="text-lg font-medium text-stone-900">{T('Akun baru', 'New account')}</h2>
                    <CreateForm astronautsWithoutAccount={data.astronautsWithoutAccount} busy={busy} onSubmit={create} onCancel={() => setMode(null)} isEn={isEn} T={T} />
                </section>
            )}

            {!users && !error && <p role="status" className="text-sm text-stone-500">{T('Memuat pengguna…', 'Loading users…')}</p>}

            {users && (
                <div className="rounded-[24px] border border-seam bg-panel overflow-hidden">
                    <div className="px-6 py-4 border-b border-seam text-xs text-stone-500">
                        {T(`${users.length} pengguna · ${admins} Admin`, `${users.length} users · ${admins} Admins`)}
                    </div>
                    <ul className="divide-y divide-seam">
                        {users.map((u) => {
                            const is = (k) => mode && mode[k] === u.id;
                            return (
                                <li key={u.id} className="px-6 py-4 grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
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
                                            <span key={c.id} className="text-xs text-stone-500">{c.missionId}{c.isLeader ? T(' (pemimpin)', ' (leader)') : ''}</span>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                        {u.protected && !u.isSelf && <span className="text-xs text-stone-500">{T('Role terlindungi', 'Protected role')}</span>}
                                        {!mode && u.canEdit && <button type="button" onClick={() => open({ edit: u.id })} className={btnGhost}>{T('Ubah', 'Edit')}</button>}
                                        {!mode && u.canPromote && <button type="button" onClick={() => open({ promote: u.id })} className={btnGhost}>{T('Jadikan Admin', 'Make Admin')}</button>}
                                        {!mode && u.canDelete && !u.isSelf && <button type="button" onClick={() => open({ del: u.id })} className={btnDanger}>{T('Hapus', 'Delete')}</button>}
                                    </div>

                                    {is('edit') && <EditForm user={u} busy={busy} onSubmit={(body) => update(u, body)} onCancel={() => setMode(null)} isEn={isEn} T={T} />}

                                    {is('promote') && (
                                        <div role="group" aria-label={T('Konfirmasi', 'Confirm')} className="md:col-span-3 rounded-[14px] border border-amber-500/40 bg-amber-50 p-4 space-y-3">
                                            <p className="text-sm text-amber-800">
                                                {T(`Angkat ${u.name} menjadi Admin? Ia akan mendapat akses penuh ke semua kabin, dan role Admin tidak bisa diturunkan lagi.`,
                                                    `Promote ${u.name} to Admin? They will get full access to every cabin, and the Admin role cannot be reverted.`)}
                                                {u.role === 'cabin_leader' && T(' Kepemimpinan kabinnya akan dilepas.', ' Their cabin leadership will be released.')}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" disabled={busy} onClick={() => promote(u)} className={btnPrimary}>
                                                    {busy ? T('Menyimpan…', 'Saving…') : T(`Jadikan ${u.name} Admin`, `Make ${u.name} Admin`)}
                                                </button>
                                                <button type="button" onClick={() => setMode(null)} className={btnGhost}>{T('Batal', 'Cancel')}</button>
                                            </div>
                                        </div>
                                    )}

                                    {is('del') && (
                                        <div role="group" aria-label={T('Konfirmasi hapus', 'Confirm delete')} className="md:col-span-3 rounded-[14px] border border-rose-500/40 bg-rose-50 p-4 space-y-3">
                                            <p className="text-sm text-rose-800">
                                                {T(`Hapus akun ${u.email}? ${u.name} tidak bisa masuk lagi. Profil dan data kesehatannya tetap tersimpan, dan akun baru bisa dibuat untuknya nanti.`,
                                                    `Delete account ${u.email}? ${u.name} can no longer sign in. Their profile and health data are kept, and a new account can be created for them later.`)}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" disabled={busy} onClick={() => remove(u)} className="h-11 px-5 rounded-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium">
                                                    {busy ? T('Menghapus…', 'Deleting…') : T(`Hapus akun ${u.name}`, `Delete ${u.name}’s account`)}
                                                </button>
                                                <button type="button" onClick={() => setMode(null)} className={btnGhost}>{T('Batal', 'Cancel')}</button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
