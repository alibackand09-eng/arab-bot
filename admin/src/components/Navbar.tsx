'use client';

import React from 'react';
import { Calendar } from 'lucide-react';

export const Navbar: React.FC = () => {
  const currentDate = new Date().toLocaleDateString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="h-16 bg-[#FFFFFF] border-b border-[#E8D8CC] px-8 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase font-semibold tracking-wider text-[#9E7D66]">
          Admin Boshqaruv Paneli
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#FAF4EF] border border-[#E8D8CC] text-xs font-medium text-[#6E4F39]">
          <Calendar className="w-3.5 h-3.5 text-[#8C5A3C]" />
          <span>{currentDate}</span>
        </div>
      </div>
    </header>
  );
};
