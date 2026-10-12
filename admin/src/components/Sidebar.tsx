'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users2,
  GraduationCap,
  CreditCard,
  BookOpen,
  CheckSquare,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Boshqaruv & Reyting', icon: LayoutDashboard },
  { href: '/groups', label: 'Guruhlar', icon: Users2 },
  { href: '/books', label: 'Kitoblar Kutubxonasi', icon: BookOpen },
  { href: '/students', label: 'O\'quvchilar & Baholar', icon: GraduationCap },
  { href: '/tests', label: 'Arab Tili Testi', icon: CheckSquare },
  { href: '/payments', label: 'To\'lovlar', icon: CreditCard },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#E8D8CC] flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#E8D8CC] flex items-center gap-3 bg-[#FAF4EF]">
        <div className="w-10 h-10 rounded-xl bg-[#8C5A3C] flex items-center justify-center text-white shadow-md">
          <BookOpen className="w-5 h-5 text-[#FAF4EF]" />
        </div>
        <div>
          <h1 className="font-bold text-[#3D200F] tracking-tight text-base font-heading">
            Arab Tili Markazi
          </h1>
          <p className="text-xs text-[#9E7D66] font-arabic">مَرْكَزُ اللُّغَةِ العَرَبِيَّةِ</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-[#8C5A3C] text-white shadow-sm font-semibold'
                  : 'text-[#6E4F39] hover:text-[#3D200F] hover:bg-[#FAF4EF]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#8C5A3C]'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Info (Hech qanday texnologiya ko'rsatkichlarisiz, minimal va sof) */}
      <div className="p-4 m-4 rounded-xl bg-[#FAF4EF] border border-[#E8D8CC] text-xs text-[#9E7D66] text-center">
        <p className="font-medium text-[#6E4F39]">O'quv Boshqaruv Tizimi</p>
        <p className="text-[11px] text-[#9E7D66] mt-0.5">Versiya 4.0</p>
      </div>
    </aside>
  );
};
