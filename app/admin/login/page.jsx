import HeroPortal from '../../../components/hero-portal';
import { guardPortalPage } from '../../../lib/server/guard-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Masuk: HERO Admin: Kesehatan Mata, Mental & Kabin Astronot' };

// Form login ada di dalam aplikasi HERO; setelah berhasil, URL berganti ke /admin tanpa memuat ulang
export default async function AdminLoginPage() {
    await guardPortalPage('admin', 'login');
    return <HeroPortal portal="admin" />;
}
