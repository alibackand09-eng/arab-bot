'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckSquare,
  BookOpen,
  Upload,
  Save,
  Loader2,
  FileText,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Infinity as InfinityIcon,
  Bell,
  X,
  Check,
  RotateCcw,
  BookMarked,
  CheckCircle2,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../../components/Toast';

const QUESTION_TYPES = [
  { id: "so'zlarning o'qilishi/talaffuzi", label: "So'zlarning o'qilishi va nozik talaffuz qoidalari" },
  { id: "aniq qoida(lar) bo'yicha", label: "Aniq grammatik qoidalar (sarf va nahv)" },
  { id: "arabcha/o'zbekcha matn asosida", label: "Arabcha / o'zbekcha matn tahlili va ma'nolar" },
  { id: "AI o'zi tanlasin", label: "AI o'zi tanlasin (barcha turlardan muvozanatli)" },
];

interface FailedAlert {
  id: number;
  student_id: number;
  telegram_id: number;
  student_name: string;
  failed_topic_number: number;
  failed_topic_title: string;
  question_text: string;
  student_answer: string;
  status: string;
  created_at: string;
}

interface LibraryBook {
  id: number;
  title: string;
  pdf_path: string;
  file_size: number;
  topics_count: number;
}

export default function TestSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Settings state
  const [bookName, setBookName] = useState('');
  const [bookPdfPath, setBookPdfPath] = useState('');
  const [bookTextLength, setBookTextLength] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState('1-8');
  const [questionTypes, setQuestionTypes] = useState<string[]>([
    "so'zlarning o'qilishi/talaffuzi",
    "aniq qoida(lar) bo'yicha",
  ]);
  const [questionCount, setQuestionCount] = useState(5);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(1);

  // Bildirishnomalar vidjeti (Band 1: faqat real natijalar, interactive widget, "O'qildi" tugmasi)
  const [failedAlerts, setFailedAlerts] = useState<FailedAlert[]>([]);
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [processingAlertId, setProcessingAlertId] = useState<number | null>(null);

  // Qayta boshlash modali
  const [restartAlert, setRestartAlert] = useState<FailedAlert | null>(null);
  const [restartTopicNumber, setRestartTopicNumber] = useState(1);
  const [restarting, setRestarting] = useState(false);

  // Kutubxonadan kitob tanlash (Band 2)
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [selectBookModalOpen, setSelectBookModalOpen] = useState(false);
  const [attachingBook, setAttachingBook] = useState(false);

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

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [settingsRes, alertsRes, booksRes] = await Promise.all([
        fetch('/api/test-settings'),
        fetch('/api/failed-alerts'),
        fetch('/api/books'),
      ]);

      const data = await settingsRes.json();
      const s = data.data || data.settings || {};
      setBookName(s.book_name || s.test_book_name || '');
      setBookPdfPath(s.book_pdf_path || s.test_book_pdf_path || '');
      setBookTextLength(s.book_text ? s.book_text.length : 0);
      setSelectedTopics(s.selected_topics || s.test_topics_selection || '1-8');
      setQuestionCount(Number(s.question_count || s.test_questions_count || 5));

      const limitVal = s.test_daily_limit !== null && s.test_daily_limit !== undefined
        ? Number(s.test_daily_limit)
        : 1;

      if (limitVal === 0) {
        setIsUnlimited(true);
        setDailyLimit(1);
      } else {
        setIsUnlimited(false);
        setDailyLimit(limitVal);
      }

      try {
        const rawTypes = s.question_types || s.test_question_types;
        if (rawTypes) {
          const parsed = typeof rawTypes === 'string' ? JSON.parse(rawTypes) : rawTypes;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuestionTypes(parsed);
          }
        }
      } catch {}

      const alertsData = await alertsRes.json();
      if (alertsData.success) {
        setFailedAlerts(alertsData.data || []);
      }

      const booksData = await booksRes.json();
      if (booksData.success) {
        setLibraryBooks(booksData.data || []);
      }
    } catch (err: any) {
      addToast('error', "Sozlamalarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggleQuestionType = (typeId: string) => {
    if (typeId === "AI o'zi tanlasin") {
      setQuestionTypes(["AI o'zi tanlasin"]);
      return;
    }

    setQuestionTypes((prev) => {
      const filtered = prev.filter((t) => t !== "AI o'zi tanlasin");
      if (filtered.includes(typeId)) {
        const next = filtered.filter((t) => t !== typeId);
        return next.length === 0 ? ["AI o'zi tanlasin"] : next;
      } else {
        return [...filtered, typeId];
      }
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      addToast('error', 'Faqat PDF formatdagi fayllarni yuklash mumkin!');
      return;
    }

    try {
      setUploadingPdf(true);
      const formData = new FormData();
      formData.append('book_pdf', file);

      const res = await fetch('/api/test-settings/upload-book', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setBookPdfPath(data.test_book_pdf_path || data.book_pdf_path);
        setBookName(data.test_book_name || file.name);
        setBookTextLength(data.textLength || 0);
        addToast('success', "Test darslik PDF kitobi muvaffaqiyatli yuklandi!");
        fetchSettings();
      } else {
        addToast('error', data.error || 'PDF yuklashda xatolik yuz berdi');
      }
    } catch (err: any) {
      addToast('error', 'PDF yuklashda xatolik: ' + err.message);
    } finally {
      setUploadingPdf(false);
      e.target.value = '';
    }
  };

  // 1-bosish orqali kutubxonadagi kitobni biriktirish
  const handleAttachLibraryBook = async (bookId: number) => {
    try {
      setAttachingBook(true);
      const res = await fetch('/api/test-settings/attach-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json();
      if (data.success) {
        setBookName(data.book_name);
        setBookPdfPath(data.book_pdf_path);
        setBookTextLength(data.textLength || 0);
        setSelectBookModalOpen(false);
        addToast('success', data.message || "Kitob test uchun biriktirildi!");
      } else {
        addToast('error', data.error || "Kitobni biriktirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setAttachingBook(false);
    }
  };

  // "O'qildi" tugmasi (Band 1 talabi: statusi o'zgaradi, bazadan o'qilgan belgilanib, ekrandan butunlay o'chib ketadi)
  const handleMarkAsRead = async (alertId: number) => {
    try {
      setProcessingAlertId(alertId);
      const res = await fetch(`/api/failed-alerts/${alertId}/read`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setFailedAlerts((prev) => prev.filter((a) => a.id !== alertId));
        addToast('success', "Xabarnoma o'qildi deb belgilandi va ro'yxatdan olib tashlandi!");
      } else {
        addToast('error', data.error || "Statusni o'zgartirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setProcessingAlertId(null);
    }
  };

  // Qayta boshlash mavzusi belgilash
  const handleConfirmRestart = async () => {
    if (!restartAlert) return;
    try {
      setRestarting(true);
      const res = await fetch(`/api/failed-alerts/${restartAlert.id}/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restartTopicNumber: Number(restartTopicNumber) || 1 }),
      });
      const data = await res.json();
      if (data.success) {
        setFailedAlerts((prev) => prev.filter((a) => a.id !== restartAlert.id));
        setRestartAlert(null);
        addToast('success', `${restartAlert.student_name} uchun ${restartTopicNumber}-mavzudan qayta boshlash belgilandi!`);
      } else {
        addToast('error', data.error || "Qayta boshlashda xatolik");
      }
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setRestarting(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const finalLimit = isUnlimited ? 0 : Math.max(1, Number(dailyLimit));

      const res = await fetch('/api/test-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_book_name: bookName,
          selected_topics: selectedTopics.trim() || 'all',
          question_types: questionTypes,
          question_count: Math.max(1, Math.min(30, Number(questionCount))),
          test_daily_limit: finalLimit,
        }),
      });

      const data = await res.json();
      if (data.success) {
        addToast('success', "Arab tili testi sozlamalari muvaffaqiyatli saqlandi!");
      } else {
        addToast('error', data.error || data.message || 'Saqlashda xatolik');
      }
    } catch (err: any) {
      addToast('error', 'Saqlashda xatolik: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8D8CC] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#8C5A3C] text-white">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-[#3D200F] font-heading">
              Arab Tili Testi — Maxsus Sozlamalar
            </h1>
          </div>
          <p className="text-sm text-[#9E7D66] mt-1">
            Qattiq darslik va belgilangan mavzular asosida test topshirish tizimi boshqaruvi.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSaveSettings}
            disabled={saving || loading}
            className="px-5 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Sozlamalarni Saqlash
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center text-[#9E7D66]">
          <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
          <span>Sozlamalar yuklanmoqda...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chap ustun: Asosiy parametrlar */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. PDF Kitob Yuklash va Kutubxonadan Tanlash */}
            <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#8C5A3C]" />
                  <h2 className="font-bold text-[#3D200F] text-base font-heading">
                    1. Test Uchun PDF Kitob (Darslik)
                  </h2>
                </div>
                {bookPdfPath && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    PDF Faol
                  </span>
                )}
              </div>

              <p className="text-xs text-[#6E4F39] mb-4">
                Admin yuklagan yoki kutubxonadan tanlangan darslik matni asosida sun'iy intellekt juda chuqur va aniq test savollarini tuzadi.
              </p>

              <div className="border-2 border-dashed border-[#DCC3B0] rounded-xl p-5 bg-[#FAF4EF] text-center hover:border-[#8C5A3C] transition-colors">
                <FileText className="w-8 h-8 text-[#8C5A3C] mx-auto mb-2 opacity-80" />
                {bookPdfPath ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#3D200F]">
                      {bookName || bookPdfPath.split(/[/\\]/).pop()}
                    </p>
                    <p className="text-xs text-[#9E7D66]">
                      Matn hajmi: {bookTextLength.toLocaleString()} ta belgi
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[#6E4F39]">
                    Hozircha test darsligi biriktirilmagan. Kutubxonadan tanlang yoki yangi PDF yuklang.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-sm">
                    {uploadingPdf ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>Yangi PDF Yuklash</span>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfUpload}
                      disabled={uploadingPdf}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={() => setSelectBookModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#FAF4EF] text-[#8C5A3C] border border-[#DCC3B0] rounded-xl text-xs font-semibold transition-all shadow-sm"
                  >
                    <BookMarked className="w-4 h-4" />
                    <span>Kutubxonadan Tanlash ({libraryBooks.length})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Mavzular Tanlovi */}
            <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-5 h-5 text-[#8C5A3C]" />
                <h2 className="font-bold text-[#3D200F] text-base font-heading">
                  2. Qaysi Mavzulardan Savol Berilsin?
                </h2>
              </div>
              <p className="text-xs text-[#6E4F39] mb-4">
                Masalan: <b>"1-8"</b> (diapazon) yoki aniq ro'yxat: <b>"2, 9, 1, 23"</b>, yoki <b>"all"</b> (barcha mavzular).
              </p>

              <div>
                <input
                  type="text"
                  value={selectedTopics}
                  onChange={(e) => setSelectedTopics(e.target.value)}
                  placeholder="Masalan: 1-8 yoki 2, 9, 1, 23"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#DCC3B0] bg-[#FAF4EF] text-[#3D200F] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
                />
              </div>

              <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <b>Muhim mantiqiy qoida faol:</b> Agar mavzu bitta so'zning o'qilishi haqida bo'lsa, savol o'sha so'zning o'ziga oid nozik talaffuz detallari bilan murakkablashtiriladi. Mavzuda yo'q grammatik tushunchalar aralashtirilmaydi.
                </div>
              </div>
            </div>

            {/* 3. Savol Turi Tanlovi */}
            <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-[#8C5A3C]" />
                <h2 className="font-bold text-[#3D200F] text-base font-heading">
                  3. Savol Turi Tanlovi
                </h2>
              </div>
              <p className="text-xs text-[#6E4F39] mb-4">
                Admin bir yoki bir nechta savol turini tanlashi mumkin:
              </p>

              <div className="space-y-2.5">
                {QUESTION_TYPES.map((qt) => {
                  const isChecked = questionTypes.includes(qt.id);
                  return (
                    <label
                      key={qt.id}
                      onClick={() => handleToggleQuestionType(qt.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-[#FAF4EF] border-[#8C5A3C] text-[#3D200F] font-semibold'
                          : 'bg-[#FFFFFF] border-[#E8D8CC] text-[#6E4F39] hover:bg-[#FAF4EF]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-[#8C5A3C] accent-[#8C5A3C]"
                      />
                      <span>{qt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* O'ng ustun: Miqdor & Cheklovlar */}
          <div className="space-y-6">
            {/* 4. Savollar Soni & Kunlik Limit */}
            <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-[#E8D8CC] pb-3">
                <Clock className="w-5 h-5 text-[#8C5A3C]" />
                <h2 className="font-bold text-[#3D200F] text-base font-heading">
                  4. Miqdor va Kunlik Limit
                </h2>
              </div>

              {/* Savollar soni */}
              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                  Har bir testdagi savollar soni:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-xl border border-[#DCC3B0] bg-[#FAF4EF] text-center font-bold text-[#3D200F] text-sm focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
                  />
                  <span className="text-xs text-[#9E7D66]">ta savol</span>
                </div>
              </div>

              {/* Kunlik limit */}
              <div className="pt-3 border-t border-[#E8D8CC]">
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                  Har bir foydalanuvchi uchun kunlik limit:
                </label>

                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 text-xs text-[#3D200F] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUnlimited}
                      onChange={(e) => setIsUnlimited(e.target.checked)}
                      className="w-4 h-4 text-[#8C5A3C] accent-[#8C5A3C] rounded"
                    />
                    <span className="font-semibold flex items-center gap-1.5">
                      <InfinityIcon className="w-4 h-4 text-[#8C5A3C]" /> Cheksiz (limitsiz) test
                    </span>
                  </label>

                  {!isUnlimited && (
                    <div className="flex items-center gap-3 pl-6">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(Number(e.target.value))}
                        className="w-24 px-3 py-2 rounded-xl border border-[#DCC3B0] bg-[#FAF4EF] text-center font-bold text-[#3D200F] text-sm focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
                      />
                      <span className="text-xs text-[#9E7D66]">marta kuniga</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Xabar namunasi */}
              <div className="p-3 rounded-xl bg-[#FAF4EF] border border-[#E8D8CC] text-[11px] text-[#6E4F39] space-y-1">
                <span className="font-semibold text-[#3D200F]">Botdagi cheklov xabari:</span>
                <p className="italic">"Sizning limitingiz 00:00 da ochiladi"</p>
                <p className="text-[#9E7D66] text-[10px]">
                  * Administrator uchun hech qanday cheklov qo'llanmaydi.
                </p>
              </div>
            </div>

            {/* Yashirinlik eslatmasi */}
            <div className="bg-[#FAF4EF] border border-[#E8D8CC] rounded-2xl p-5 text-xs text-[#6E4F39] space-y-2">
              <span className="font-bold text-[#3D200F] flex items-center gap-1.5">
                🔒 Yashirinlik kafolati:
              </span>
              <p className="text-[11px] leading-relaxed text-[#9E7D66]">
                Bu sozlamalarning barchasi faqat ushbu admin panelda ko'rinadi. Oddiy foydalanuvchi menyusida faqat <b>"AI Ustoz"</b> va <b>"Arab Tili Testi"</b> tugmalari bo'lib, mexanizm va kitob nomi to'liq yashirin qoladi.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* BAND 1: BILDIRISHNOMALAR VA XABARLAR INTERACTIVE VIDJETI   */}
      {/* Ekranning pastki burchagidagi ixcham interaktiv vidjet    */}
      {/* ========================================================= */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setAlertsDrawerOpen(!alertsDrawerOpen)}
          className={`relative p-3.5 rounded-full shadow-xl transition-all duration-300 flex items-center justify-center ${
            failedAlerts.length > 0
              ? 'bg-amber-600 hover:bg-amber-700 text-white animate-bounce-short ring-4 ring-amber-200'
              : 'bg-[#8C5A3C] hover:bg-[#A6714E] text-white ring-2 ring-[#E8D8CC]'
          }`}
          title="O'quvchilar xabarnomalarini ko'rish"
        >
          <Bell className="w-6 h-6" />
          {failedAlerts.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
              {failedAlerts.length}
            </span>
          )}
        </button>
      </div>

      {/* BILDIRISHNOMALAR QALQIB CHIQISH MODALI / VIDJETI */}
      {alertsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-3xl w-full max-w-xl max-h-[85vh] p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#3D200F] text-base font-heading">
                    Nazorat Savollaridan O'tolmaganlar
                  </h3>
                  <p className="text-xs text-[#9E7D66]">
                    {failedAlerts.length > 0
                      ? `${failedAlerts.length} ta o'qilmagan xabarnoma mavjud (faqat real natijalar)`
                      : "Barcha xabarnomalar o'qilgan"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAlertsDrawerOpen(false)}
                className="p-1.5 rounded-xl text-[#9E7D66] hover:bg-[#FAF4EF] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {failedAlerts.length === 0 ? (
                <div className="py-12 text-center text-[#9E7D66] space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-[#3D200F]">Barcha xabarlar o'qilgan!</p>
                  <p className="text-xs max-w-xs mx-auto text-[#6E4F39]">
                    Nazorat savollaridan o'tolmagan yangi o'quvchilar xabarlari kelganda shu yerda paydo bo'ladi.
                  </p>
                </div>
              ) : (
                failedAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-2xl border border-amber-200 bg-amber-50/60 space-y-3 transition-all hover:bg-amber-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#3D200F] text-sm flex items-center gap-1.5">
                          <span>👤 {alert.student_name}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-200">
                            ❌ {alert.failed_topic_number}-mavzu
                          </span>
                        </div>
                        <div className="text-xs text-[#9E7D66] mt-0.5 font-medium">
                          Mavzu: <i>{alert.failed_topic_title}</i>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#9E7D66] whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleTimeString('uz-UZ', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-xs text-[#6E4F39] space-y-1 bg-white p-3 rounded-xl border border-amber-200">
                      <div>
                        <span className="font-semibold text-[#3D200F]">Berilgan savol:</span>{' '}
                        {alert.question_text}
                      </div>
                      <div>
                        <span className="font-semibold text-red-700">O'quvchi javobi:</span>{' '}
                        <i className="italic">"{alert.student_answer}"</i>
                      </div>
                    </div>

                    {/* Tugmalar: "O'qildi" va "Qayta boshlash" */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setRestartAlert(alert);
                          setRestartTopicNumber(alert.failed_topic_number || 1);
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-[#FAF4EF] text-[#8C5A3C] border border-[#DCC3B0] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Qayta topshirtirish</span>
                      </button>

                      <button
                        onClick={() => handleMarkAsRead(alert.id)}
                        disabled={processingAlertId === alert.id}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                        title="Xabarnomani o'qildi deb belgilash va o'chirish"
                      >
                        {processingAlertId === alert.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>O'qildi</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E8D8CC] flex justify-end shrink-0">
              <button
                onClick={() => setAlertsDrawerOpen(false)}
                className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Qayta Boshlash Mavzusini Belgilash Modali */}
      {restartAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3">
              <h3 className="font-bold text-[#3D200F] text-base font-heading flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-[#8C5A3C]" />
                Qayta Boshlash Mavzusi
              </h3>
              <button
                onClick={() => setRestartAlert(null)}
                className="p-1 rounded-lg text-[#9E7D66] hover:bg-[#FAF4EF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div><b>O'quvchi:</b> {restartAlert.student_name}</div>
              <div><b>O'tolmagan mavzu:</b> {restartAlert.failed_topic_number}-mavzu</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                O'quvchi qaysi mavzudan darsni qayta boshlasin? (1, 2, ...):
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={restartTopicNumber}
                onChange={(e) => setRestartTopicNumber(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#DCC3B0] rounded-xl text-sm font-bold text-[#3D200F] focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
              />
              <p className="text-[11px] text-[#9E7D66] mt-1">
                AI Ustoz ushbu belgilangan mavzudan dars berishni qayta boshlaydi.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8D8CC]">
              <button
                type="button"
                onClick={() => setRestartAlert(null)}
                className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleConfirmRestart}
                disabled={restarting}
                className="px-5 py-2 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                {restarting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Belgilash va Ruxsat Berish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kutubxonadan Kitob Tanlash Modali (1 bosish bilan biriktirish) */}
      {selectBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-[#8C5A3C]" />
                <h3 className="font-bold text-[#3D200F] text-base font-heading">
                  Kutubxonadan Darslik Tanlash
                </h3>
              </div>
              <button
                onClick={() => setSelectBookModalOpen(false)}
                className="p-1 rounded-lg text-[#9E7D66] hover:bg-[#FAF4EF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {libraryBooks.length === 0 ? (
                <div className="py-8 text-center text-[#9E7D66] text-xs space-y-1">
                  <p className="font-semibold text-sm text-[#3D200F]">Kutubxona bo'sh</p>
                  <p>Avval "Kitoblar Kutubxonasi" sahifasida PDF darslik yuklang.</p>
                </div>
              ) : (
                libraryBooks.map((bk) => (
                  <div
                    key={bk.id}
                    className="p-3.5 rounded-xl border border-[#E8D8CC] bg-[#FAF4EF]/40 hover:bg-[#FAF4EF] transition-colors flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-[#3D200F] text-sm">{bk.title}</div>
                      <div className="text-xs text-[#9E7D66]">
                        {bk.topics_count || 0} ta mavzu · {Math.round(bk.file_size / 1024)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleAttachLibraryBook(bk.id)}
                      disabled={attachingBook}
                      className="px-3.5 py-1.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1 disabled:opacity-50"
                    >
                      {attachingBook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Tanlash</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E8D8CC] flex justify-end shrink-0">
              <button
                onClick={() => setSelectBookModalOpen(false)}
                className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
