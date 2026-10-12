'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Users2,
  CheckCircle2,
  Award,
  ArrowRight,
  Plus,
  Star,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../components/Toast';

interface GroupStat {
  id: number;
  name: string;
  access_code: string;
  student_count: number;
  avg_grade: number;
  paid_count: number;
}

interface StudentRank {
  id: number;
  first_name: string;
  username: string;
  grade: number;
  group_name: string;
  joined_group_id: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [groups, setGroups] = useState<GroupStat[]>([]);
  const [students, setStudents] = useState<StudentRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, studentsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/students'),
      ]);

      const sData = await statsRes.json();
      const stData = await studentsRes.json();

      if (sData.success) {
        setStats(sData.stats);
        setGroups(sData.groupsStats || []);
      }
      if (stData.success) {
        setStudents(stData.data || []);
      }
    } catch (err: any) {
      addToast('error', "Ma'lumotlarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header Banner */}
      <div className="rounded-2xl p-7 bg-[#FFFFFF] border border-[#E8D8CC] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#3D200F] font-heading">
            Arab Tili Markazi Boshqaruvi
          </h2>
          <p className="text-sm text-[#6E4F39] mt-1 font-arabic text-base">
            Guruhlar statistikasi, o'quvchilar reytingi va to'lovlarni sodda boshqaring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/groups"
            className="px-4 py-2.5 bg-[#FAF4EF] hover:bg-[#F4E8DC] text-[#6E4F39] border border-[#E8D8CC] rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            <Users2 className="w-4 h-4 text-[#8C5A3C]" /> Guruh Yaratish
          </Link>
          <Link
            href="/students"
            className="px-4 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> O'quvchi Qo'shish
          </Link>
        </div>
      </div>



      {/* 4 Ta Asosiy Ko'rsatkich Kartalari */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#E8D8CC] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Jami O'quvchilar</span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF4EF] text-[#8C5A3C] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-[#3D200F] font-heading">
              {loading ? '...' : stats?.totalUsers || 0}
            </span>
            <span className="text-xs text-[#9E7D66] ml-2">nafar</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#E8D8CC] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Faol Guruhlar</span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF4EF] text-[#8C5A3C] flex items-center justify-center">
              <Users2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-[#3D200F] font-heading">
              {loading ? '...' : stats?.totalGroups || 0}
            </span>
            <span className="text-xs text-[#9E7D66] ml-2">ta guruh</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#E8D8CC] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">To'lagan O'quvchilar</span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF4EF] text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-emerald-800 font-heading">
              {loading ? '...' : stats?.paidUsers || 0}
            </span>
            <span className="text-xs text-[#9E7D66] ml-2">
              (Qarz: {stats?.unpaidUsers || 0})
            </span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] rounded-2xl p-5 border border-[#E8D8CC] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Baholangan O'quvchilar</span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF4EF] text-[#C59858] flex items-center justify-center">
              <Star className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-[#C59858] font-heading">
              {loading ? '...' : stats?.gradedUsers || 0}
            </span>
            <span className="text-xs text-[#9E7D66] ml-2">1..5 baho</span>
          </div>
        </div>
      </div>

      {/* Guruhlar bo'yicha Reyting va Statistika (Band 3 & 10) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#8C5A3C]" />
            <h3 className="font-bold text-[#3D200F] text-lg font-heading">
              Guruhlar Reytingi va Natijalari
            </h3>
          </div>
          <Link
            href="/students"
            className="text-xs text-[#8C5A3C] hover:text-[#A6714E] font-semibold flex items-center gap-1"
          >
            Baholash bo'limiga o'tish <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="py-12 text-center text-[#9E7D66] flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
            <span>Ma'lumotlar yuklanmoqda...</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-10 text-center text-[#9E7D66]">
            Hozircha guruhlar mavjud emas. "Guruhlar" bo'limidan birinchi guruhni yarating.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {groups.map((grp) => {
              // Shu guruh o'quvchilari (Dublikatsiz, reyting bo'yicha)
              const groupStudents = Array.from(
                new Map(
                  students
                    .filter((s) => s.joined_group_id === grp.id)
                    .map((s) => [s.id, s])
                ).values()
              ).sort((a, b) => (b.grade || 0) - (a.grade || 0));

              return (
                <div
                  key={grp.id}
                  className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between border-b border-[#E8D8CC] pb-3">
                    <div>
                      <h4 className="font-bold text-[#3D200F] text-base font-heading">
                        {grp.name}
                      </h4>
                      <p className="text-xs text-[#9E7D66] mt-0.5">
                        Kirish kodi: <span className="font-mono font-bold text-[#8C5A3C]">{grp.access_code}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-[#6E4F39] px-2.5 py-1 rounded-full bg-[#FAF4EF] border border-[#E8D8CC]">
                        {grp.student_count || 0} nafar o'quvchi
                      </span>
                      <div className="text-[11px] text-[#9E7D66] mt-1">
                        O'rtacha baho: <span className="font-bold text-[#C59858]">⭐️ {grp.avg_grade || '0.0'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Guruh O'rinlari Jadvali */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#9E7D66] mb-2">
                      Guruh Reytingi (Botda ham shu tartibda ko'rinadi)
                    </h5>

                    {groupStudents.length === 0 ? (
                      <p className="text-xs text-[#9E7D66] py-3 text-center bg-[#FAF4EF] rounded-xl">
                        Bu guruhga hali o'quvchi qo'shilmagan
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {groupStudents.map((st, idx) => {
                          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                          return (
                            <div
                              key={st.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-[#FAF4EF] hover:bg-[#F4E8DC] transition-colors text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold w-6 text-center text-[#8C5A3C]">
                                  {medal}
                                </span>
                                <span className="font-semibold text-[#3D200F]">
                                  {st.first_name}
                                </span>
                                {st.username && (
                                  <span className="text-[11px] text-[#9E7D66]">
                                    @{st.username}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#8C5A3C]">
                                  {st.grade ? `⭐️ ${st.grade} baho` : 'Baholanmagan'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
