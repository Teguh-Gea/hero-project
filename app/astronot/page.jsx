import HeroPortal from '../../components/hero-portal';
import { guardPortalPage } from '../../lib/server/guard-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HERO Astronot: Kesehatan Mata, Mental & Kabin' };

export default async function AstronotPage() {
    await guardPortalPage('astronot', 'app');
    return <HeroPortal portal="astronot" />;
}
