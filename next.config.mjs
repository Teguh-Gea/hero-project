/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    // Komponen HERO ditulis sebelum migrasi dan punya efek (audio, sinkronisasi) yang
    // tidak dirancang untuk dijalankan dua kali oleh Strict Mode saat development.
    reactStrictMode: false,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'same-origin' },
                    { key: 'X-Frame-Options', value: 'DENY' }
                ]
            }
        ];
    }
};

export default nextConfig;
