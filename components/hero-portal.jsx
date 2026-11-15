'use client';

import dynamic from 'next/dynamic';

// Aplikasi HERO memakai window, localStorage, audio, dan speech API sejak render pertama,
// jadi hanya dirender di browser (sama seperti versi sebelumnya).
const HeroApp = dynamic(() => import('./hero-app'), {
    ssr: false,
    loading: () => <div style={{ padding: 24, color: '#7D8793', fontFamily: 'system-ui, sans-serif' }}>Memuat HERO...</div>
});

export default function HeroPortal({ portal }) {
    return <HeroApp portal={portal} />;
}
