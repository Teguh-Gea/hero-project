import Link from 'next/link';

export const metadata = { title: 'HERO: pilih portal' };

export default function Home() {
    return (
        <main className="min-h-screen flex items-center justify-center px-5 py-10 bg-canvas text-stone-900 font-sans">
            <div className="w-full max-w-[560px]">
                <h1 className="text-4xl font-light tracking-[-0.02em] leading-[1.1]">HERO</h1>
                <p className="text-sm text-stone-500 mt-3 max-w-[60ch]">Pemantauan kesehatan mata, mental, dan kabin astronot. Pilih portal sesuai akun Anda.</p>
                <ul className="mt-8 grid gap-3">
                    <li>
                        <Link href="/astronot" className="block rounded-[20px] border border-seam bg-panel p-6 hover:border-stone-400">
                            <span className="block text-lg font-medium text-stone-900">Portal astronot</span>
                            <span className="block text-sm text-stone-500 mt-1">Kelola data kesehatan Anda dan lihat data rekan sekabin. Pemimpin kabin juga mengelola data lingkungan kabin.</span>
                        </Link>
                    </li>
                    <li>
                        <Link href="/admin" className="block rounded-[20px] border border-seam bg-panel p-6 hover:border-stone-400">
                            <span className="block text-lg font-medium text-stone-900">Portal admin</span>
                            <span className="block text-sm text-stone-500 mt-1">Kelola seluruh astronot, misi, modul kabin, pemimpin kabin, dan persetujuan protokol.</span>
                        </Link>
                    </li>
                </ul>
            </div>
        </main>
    );
}
