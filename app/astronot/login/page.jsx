import HeroPortal from '../../../components/hero-portal';
import { guardPortalPage } from '../../../lib/server/guard-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Masuk: HERO Astronot: Kesehatan Mata, Mental & Kabin' };

// Form login ada di dalam aplikasi HERO; setelah berhasil, URL berganti ke /astronot tanpa memuat ulang
export default async function AstronotLoginPage() {
    await guardPortalPage('astronot', 'login');
    return <HeroPortal portal="astronot" />;
}
