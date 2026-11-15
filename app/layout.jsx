import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata = {
    title: 'HERO',
    description: 'Pemantauan kesehatan mata (SANS), mental, dan kabin astronot.'
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#07090C'
};

export default function RootLayout({ children }) {
    return (
        <html lang="id" className={`${geist.variable} ${geistMono.variable}`}>
            <body>{children}</body>
        </html>
    );
}
