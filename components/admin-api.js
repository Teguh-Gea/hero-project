// Pemanggil API untuk halaman Admin (Pengguna, Misi). Server tetap memeriksa semua hak akses.
export async function adminApi(path, { method, body } = {}) {
    const m = method || (body ? 'POST' : 'GET');
    const res = await fetch(path, {
        method: m,
        credentials: 'same-origin',
        headers: m !== 'GET' ? { 'Content-Type': 'application/json', 'X-HERO-Request': '1' } : {},
        body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* respons tanpa JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Server membalas ${res.status}.`);
    return data;
}

export const inputCls = 'h-11 w-full rounded-[12px] bg-well border border-stone-200 px-4 text-base text-stone-900 focus:border-stone-500';
export const btnPrimary = 'h-11 px-5 rounded-full bg-signal hover:bg-signal-soft disabled:opacity-50 text-ink text-sm font-medium';
export const btnGhost = 'h-11 px-5 rounded-full border border-stone-300 text-sm text-stone-900 hover:border-stone-500 disabled:opacity-50';
export const btnDanger = 'h-11 px-5 rounded-full border border-rose-500/50 text-sm text-rose-300 hover:border-rose-400 disabled:opacity-50';
