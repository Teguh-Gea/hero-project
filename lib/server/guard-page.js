// Proteksi halaman portal di server (dipanggil dari server component sebelum HTML dikirim).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from './auth.js';
import { portalRedirect } from './authz.js';

//   page 'app'   : belum masuk -> /<portal>/login, salah portal -> portal miliknya
//   page 'login' : sudah masuk -> portal miliknya
export async function guardPortalPage(portal, page) {
    const sid = (await cookies()).get(SESSION_COOKIE)?.value;
    const to = portalRedirect(sid, portal, page);
    if (to) redirect(to);
}
