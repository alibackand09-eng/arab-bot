import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';

export const metadata: Metadata = {
  title: 'Arab Tili Markazi — Boshqaruv Paneli',
  description: 'Guruhlar, baholar va to\'lovlarni boshqarish tizimi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz">
      <body className="flex h-screen overflow-hidden bg-[#F7EFE9] text-[#3D200F]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
