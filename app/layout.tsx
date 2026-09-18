import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title:'Факт / кто это?', description:'Интерактивный квиз для компании' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ru"><body>{children}</body></html>; }
