'use client';

import React, { useEffect, useState } from 'react';
import {
  GraduationCap,
  Plus,
  Trash2,
  Edit,
  Star,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Calendar,
  Lock,
  Award,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

interface StudentItem {
  id: number;
  first_name: string;
  username: string;
  joined_group_id: number;
  group_name: string;
  grade: number;
  grades_count?: number;
  total_score?: number;
  avg_grade?: number;
  today_grade?: number | null;
  is_paid: boolean;
  current_topic_index?: number;
  last_topic_passed?: number;
  study_step_state?: string;
  created_at: string;
}

interface GroupOption {
  id: number;
  name: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>('');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [form, setForm] = useState({
    first_name: '',
    username: '',
    joined_group_id: '',
    grade: '5',
    is_paid: false,
  });
  const [saving, setSaving] = useState(false);

  // O'quvchi mavzusini o'zgartirish modali
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicStudent, setTopicStudent] = useState<StudentItem | null>(null);
  const [targetTopicInput, setTargetTopicInput] = useState(1);
  const [savingTopic, setSavingTopic] = useState(false);

  // O'chirish
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<StudentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Toshkent vaqti bo'yicha sanani avtomatik hisoblash
  const updateCurrentDate = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now);
    setCurrentDateFormatted(formatter.format(now));
    setCurrentDateStr(isoDate);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      updateCurrentDate();
      const [stRes, grpRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/groups'),
      ]);

      const stData = await stRes.json();
      const grpData = await grpRes.json();

      if (stData.success) {
        setStudents(stData.data || []);
        if (stData.today) {
          setCurrentDateStr(stData.today);
        }
      }
      if (grpData.success) setGroups(grpData.data || []);
    } catch (err: any) {
      addToast('error', "Ma'lumotlarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTopicModal = (st: StudentItem) => {
    setTopicStudent(st);
    setTargetTopicInput(st.current_topic_index || 1);
    setTopicModalOpen(true);
  };

  const handleConfirmSetTopic = async () => {
    if (!topicStudent) return;
    try {
      setSavingTopic(true);
      const res = await fetch(`/api/students/${topicStudent.id}/set-topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicNumber: Number(targetTopicInput) || 1 }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', `${topicStudent.first_name} ning AI Ustoz darsi ${targetTopicInput}-mavzuga belgilandi!`);
        setTopicModalOpen(false);
        loadData();
      } else {
        addToast('error', data.error || 'Mavzuni belgilashda xatolik');
      }
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setSavingTopic(false);
    }
  };

  useEffect(() => {
    loadData();
    // Har daqiqada sanani avtomatik tekshirib yangilab turadi
    const interval = setInterval(() => {
      updateCurrentDate();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Tezkor baho qo'yish (Sanaga qarab, 1 marta qo'yiladi, jamlab boriladi, o'zgartirib bo'lmaydi)
  const handleQuickGrade = async (studentId: number, grade: number, studentName: string) => {
    try {
      const res = await fetch(`/api/students/${studentId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, lesson_title: `Dars (${currentDateFormatted})` }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', `✅ ${studentName} uchun ⭐️ ${grade} baho muvaffaqiyatli qo'yildi! Jami ball: ${data.totalScore}`);
        await loadData();
      } else {
        addToast('error', data.message || "Baholashda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Xatolik: " + err.message);
    }
  };

  const openCreateModal = () => {
    setEditingStudent(null);
    setForm({
      first_name: '',
      username: '',
      joined_group_id: groups[0]?.id ? String(groups[0].id) : '',
      grade: '5',
      is_paid: false,
    });
    setModalOpen(true);
  };

  const openEditModal = (st: StudentItem) => {
    setEditingStudent(st);
    setForm({
      first_name: st.first_name || '',
      username: st.username || '',
      joined_group_id: st.joined_group_id ? String(st.joined_group_id) : '',
      grade: st.grade ? String(Math.round(st.grade)) : '5',
      is_paid: st.is_paid || false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) {
      addToast('error', "O'quvchi ismi kiritilishi shart!");
      return;
    }

    try {
      setSaving(true);
      const url = editingStudent ? `/api/students/${editingStudent.id}` : '/api/students';
      const method = editingStudent ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          username: form.username.trim(),
          joined_group_id: form.joined_group_id ? parseInt(form.joined_group_id, 10) : null,
          grade: form.grade ? parseInt(form.grade, 10) : null,
          is_paid: form.is_paid,
        }),
      });

      const data = await res.json();
      if (data.success) {
        addToast('success', editingStudent ? "✅ O'quvchi tahrirlandi" : "✅ O'quvchi qo'shildi");
        setModalOpen(false);
        await loadData();
      } else {
        addToast('error', data.message || "Saqlashda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Xatolik: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (st: StudentItem) => {
    setStudentToDelete(st);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!studentToDelete) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/students/${studentToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast('success', "✅ " + data.message);
        setDeleteModalOpen(false);
        setStudentToDelete(null);
        await loadData();
      }
    } catch (err: any) {
      addToast('error', "O'chirishda xatolik");
    } finally {
      setDeleting(false);
    }
  };

  // Dublikatlarni to'liq bartaraf etish
  const uniqueStudentsMap = new Map<number, StudentItem>();
  students.forEach((s) => {
    if (!uniqueStudentsMap.has(s.id)) {
      uniqueStudentsMap.set(s.id, s);
    }
  });

  // Ro'yxat JAMLANGAN UMUMIY BALL (total_score) bo'yicha yuqoridan pastga tartiblanadi!
  const sortedStudents = Array.from(uniqueStudentsMap.values()).sort((a, b) => {
    const scoreDiff = (b.total_score || 0) - (a.total_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const avgDiff = (b.avg_grade || b.grade || 0) - (a.avg_grade || a.grade || 0);
    if (avgDiff !== 0) return avgDiff;
    return a.id - b.id;
  });

  const filteredStudents = selectedGroupFilter === 'all'
    ? sortedStudents
    : sortedStudents.filter((s) => String(s.joined_group_id) === selectedGroupFilter);

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="O'quvchini o'chirish"
        message={`"${studentToDelete?.first_name}" o'quvchisini rostdan ham o'chirmoqchimisiz?`}
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#3D200F] font-heading flex items-center gap-2.5">
            <GraduationCap className="w-6 h-6 text-[#8C5A3C]" />
            O'quvchilar va Sanaga Qarab Baholash Bo'limi
          </h2>
          <p className="text-sm text-[#6E4F39] mt-0.5">
            Har bir dars uchun baho to'planib boradi. Sana o'zgarganda avtomatik yangilanadi va bir marta qo'yilgan bahoni o'zgartirib bo'lmaydi.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Yangi O'quvchi Qo'shish
        </button>
      </div>

      {/* Avtomatik Sana va Filter Paneli */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Avtomatik doimiy hisoblanadigan sana */}
        <div className="bg-[#FAF4EF] border border-[#E8D8CC] p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#8C5A3C] text-white flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#9E7D66]">
              Joriy Baholash Sanasi (Avtomatik)
            </div>
            <div className="text-sm font-extrabold text-[#3D200F] capitalize">
              {currentDateFormatted || 'Yuklanmoqda...'}
            </div>
          </div>
        </div>

        {/* Guruh filteri */}
        <div className="bg-[#FFFFFF] p-3.5 rounded-2xl border border-[#E8D8CC] flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#6E4F39]">Guruh bo'yicha saralash:</span>
          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-xs font-semibold text-[#3D200F] focus:outline-none"
          >
            <option value="all">Barcha Guruhlar ({sortedStudents.length} nafar o'quvchi)</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>



      {/* Jadval */}
      <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-[#9E7D66] flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
            <span>O'quvchilar ro'yxati yuklanmoqda...</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-16 text-center text-[#9E7D66]">
            Hozircha o'quvchilar mavjud emas. Yuqoridagi tugma orqali o'quvchi qo'shing.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#3D200F]">
              <thead className="text-xs text-[#9E7D66] uppercase bg-[#FAF4EF] border-b border-[#E8D8CC]">
                <tr>
                  <th className="px-5 py-3.5">O'rin & O'quvchi</th>
                  <th className="px-5 py-3.5">Guruh</th>
                  <th className="px-5 py-3.5">To'plangan Jami Ball</th>
                  <th className="px-5 py-3.5">AI Ustoz Darsi</th>
                  <th className="px-5 py-3.5">Bugungi Baho ({currentDateStr})</th>
                  <th className="px-5 py-3.5">To'lov Holati</th>
                  <th className="px-5 py-3.5 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D8CC]">
                {filteredStudents.map((st, idx) => {
                  const hasGradeToday = st.today_grade !== null && st.today_grade !== undefined;
                  const totalScore = st.total_score || 0;
                  const gradesCount = st.grades_count || 0;

                  return (
                    <tr key={st.id} className="hover:bg-[#FAF4EF]/50 transition-colors">
                      <td className="px-5 py-4 font-semibold text-[#3D200F]">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 text-center text-xs font-bold text-[#8C5A3C]">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </span>
                          <div>
                            <span className="font-bold">{st.first_name}</span>
                            {st.username && (
                              <span className="text-xs text-[#9E7D66] ml-2 font-normal">
                                @{st.username}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#FAF4EF] text-[#6E4F39] border border-[#E8D8CC]">
                          {st.group_name || 'Guruhsiz'}
                        </span>
                      </td>

                      {/* To'plangan umumiy jamlama ball (Talab: nechchi olsa qo'shib ketaversin) */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#8C5A3C] bg-[#FAF4EF] px-3 py-1 rounded-xl border border-[#E8D8CC] flex items-center gap-1">
                            <Award className="w-4 h-4 text-amber-500" />
                            {totalScore} ball
                          </span>
                          <span className="text-xs text-[#9E7D66]">
                            ({gradesCount} ta baho qo'yilgan)
                          </span>
                        </div>
                      </td>

                      {/* AI Ustoz Darsi (Band 4) */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {st.study_step_state === 'blocked_review_failed' ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                              ⚠️ Nazoratdan o'tolmadi
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-[#8C5A3C] bg-[#FAF4EF] px-2.5 py-1 rounded-xl border border-[#E8D8CC] flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" /> {st.current_topic_index || 1}-mavzuda
                            </span>
                          )}
                          <button
                            onClick={() => handleOpenTopicModal(st)}
                            className="text-xs font-semibold text-[#8C5A3C] hover:underline"
                            title="O'quvchi mavzusini o'zgartirish"
                          >
                            O'zgartirish
                          </button>
                        </div>
                      </td>

                      {/* Bugungi baho (1 marta qo'yilgandan keyin o'zgartirib bo'lmaydi) */}
                      <td className="px-5 py-4">
                        {hasGradeToday ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold">
                            <Lock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Bugun baholangan: ⭐️ {st.today_grade}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <button
                                key={score}
                                onClick={() => handleQuickGrade(st.id, score, st.first_name)}
                                className="w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center bg-[#FAF4EF] hover:bg-[#8C5A3C] hover:text-white text-[#6E4F39] border border-[#E8D8CC] active:scale-95 shadow-sm"
                                title={`Bugun uchun ⭐️ ${score} baho qo'yish (baho bir marta qo'yiladi va umumiy ballga qo'shiladi)`}
                              >
                                {score}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1 ${
                            st.is_paid
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {st.is_paid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                          {st.is_paid ? 'To\'lagan' : 'To\'lamagan'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(st)}
                            className="p-1.5 text-[#6E4F39] hover:text-[#3D200F] bg-[#FAF4EF] hover:bg-[#F4E8DC] rounded-lg transition-colors border border-[#E8D8CC]"
                            title="Tahrirlash"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => confirmDelete(st)}
                            className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* O'quvchi Qo'shish / Tahrirlash Modali */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-5 right-5 text-[#9E7D66] hover:text-[#3D200F]"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-[#3D200F] font-heading mb-4">
              {editingStudent ? "O'quvchini Tahrirlash" : "Yangi O'quvchi Qo'shish"}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  O'quvchining ismi *
                </label>
                <input
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="Masalan: Ali Valiyev"
                  className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-sm text-[#3D200F] focus:outline-none focus:border-[#8C5A3C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  Telegram Username (ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Masalan: ali_valiyev (@ siz)"
                  className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-sm text-[#3D200F] focus:outline-none focus:border-[#8C5A3C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  O'quv guruhi
                </label>
                <select
                  value={form.joined_group_id}
                  onChange={(e) => setForm({ ...form, joined_group_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-sm text-[#3D200F] focus:outline-none focus:border-[#8C5A3C]"
                >
                  <option value="">Guruhsiz</option>
                  {groups.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_paid"
                  checked={form.is_paid}
                  onChange={(e) => setForm({ ...form, is_paid: e.target.checked })}
                  className="w-4 h-4 text-[#8C5A3C] rounded border-[#E8D8CC]"
                />
                <label htmlFor="is_paid" className="text-xs font-medium text-[#3D200F]">
                  Kurs to'lovini to'lagan (faol o'quvchi)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E8D8CC]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-sm font-semibold hover:bg-[#FAF4EF]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* 2. O'quvchi Mavzusini O'zgartirish Modali */}
      {topicModalOpen && topicStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3">
              <h3 className="font-bold text-[#3D200F] text-base font-heading flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#8C5A3C]" />
                Mavzuni O'zgartirish
              </h3>
              <button
                onClick={() => setTopicModalOpen(false)}
                className="p-1 rounded-lg text-[#9E7D66] hover:bg-[#FAF4EF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-[#6E4F39] mb-3">
                <b>{topicStudent.first_name}</b> uchun AI Ustoz joriy dars mavzusini belgilang:
              </p>
              <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                Mavzu raqami:
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={targetTopicInput}
                onChange={(e) => setTargetTopicInput(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#DCC3B0] rounded-xl text-sm font-bold text-[#3D200F] focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8D8CC]">
              <button
                type="button"
                onClick={() => setTopicModalOpen(false)}
                className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleConfirmSetTopic}
                disabled={savingTopic}
                className="px-5 py-2 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                {savingTopic && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
