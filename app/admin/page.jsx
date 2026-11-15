import HeroPortal from '../../components/hero-portal';
import { guardPortalPage } from '../../lib/server/guard-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HERO Admin: Kesehatan Mata, Mental & Kabin Astronot' };

export default async function AdminPage() {
    await guardPortalPage('admin', 'app');
    return <HeroPortal portal="admin" />;
}
