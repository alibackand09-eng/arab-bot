'use client';

import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Upload,
  FileText,
  Loader2,
  Calendar,
  Layers,
  Users2,
  X,
  Eye,
  CheckCircle2,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

interface BookItem {
  id: number;
  title: string;
  pdf_path: string;
  file_size: number;
  topics_count: number;
  topics?: Array<{ number: number; title: string; summary?: string }>;
  attachedGroups?: Array<{ id: number; name: string }>;
  created_at: string;
}

export default function BooksPage() {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Yuklash modali
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Mavzularni ko'rish modali
  const [viewTopicsBook, setViewTopicsBook] = useState<BookItem | null>(null);

  // O'chirish modali
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<BookItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/books');
      const data = await res.json();
      if (data.success) {
        setBooks(data.data || []);
      } else {
        addToast('error', data.error || 'Kitoblarni yuklashda xatolik');
      }
    } catch (err: any) {
      addToast('error', "Kutubxonani yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      addToast('error', 'Iltimos, PDF faylni tanlang!');
      return;
    }
    if (!uploadFile.name.toLowerCase().endsWith('.pdf')) {
      addToast('error', 'Faqat PDF formatdagi fayllarni yuklash mumkin!');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('pdf', uploadFile);
      if (uploadTitle.trim()) {
        formData.append('title', uploadTitle.trim());
      }

      const res = await fetch('/api/books', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        addToast('success', `"${data.data.title}" kitobi muvaffaqiyatli saqlandi (${data.data.topics_count || 0} ta mavzu)!`);
        setUploadModalOpen(false);
        setUploadFile(null);
        setUploadTitle('');
        fetchBooks();
      } else {
        addToast('error', data.error || 'Kitobni yuklashda xatolik yuz berdi');
      }
    } catch (err: any) {
      addToast('error', 'Yuklashda xatolik: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!bookToDelete) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/books/${bookToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', `"${bookToDelete.title}" kitobi to'liq o'chirildi!`);
        setDeleteModalOpen(false);
        setBookToDelete(null);
        fetchBooks();
      } else {
        addToast('error', data.error || "O'chirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', "O'chirishda xatolik: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    return Math.round(bytes / 1024) + ' KB';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8D8CC] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#8C5A3C] text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-[#3D200F] font-heading">
              Kitoblar & Darsliklar Kutubxonasi
            </h1>
          </div>
          <p className="text-sm text-[#9E7D66] mt-1">
            Barcha yuklangan PDF darsliklar boshqaruvi, tahlil qilingan mavzular va guruhlarga ajratish.
          </p>
        </div>

        <button
          onClick={() => {
            setUploadTitle('');
            setUploadFile(null);
            setUploadModalOpen(true);
          }}
          className="px-5 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yangi PDF Kitob Yuklash
        </button>
      </div>

      {/* Statistika Bloklari */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Jami Kitoblar</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF4EF] text-[#8C5A3C] flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#3D200F] font-heading">
              {loading ? '...' : books.length}
            </span>
            <span className="text-xs text-[#9E7D66]">ta PDF darslik</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Umumiy Mavzular</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF4EF] text-[#8C5A3C] flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#3D200F] font-heading">
              {loading ? '...' : books.reduce((acc, b) => acc + (b.topics_count || 0), 0)}
            </span>
            <span className="text-xs text-[#9E7D66]">ta avtomat tahlil qilingan mavzu</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E7D66]">Biriktirilgan Guruhlar</span>
            <div className="w-8 h-8 rounded-xl bg-[#FAF4EF] text-[#8C5A3C] flex items-center justify-center">
              <Users2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#3D200F] font-heading">
              {loading
                ? '...'
                : books.reduce((acc, b) => acc + (b.attachedGroups?.length || 0), 0)}
            </span>
            <span className="text-xs text-[#9E7D66]">ta guruhda faol</span>
          </div>
        </div>
      </div>

      {/* Kitoblar Ro'yxati */}
      <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center text-[#9E7D66]">
            <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
            <span>Kutubxona yuklanmoqda...</span>
          </div>
        ) : books.length === 0 ? (
          <div className="py-16 text-center text-[#9E7D66] space-y-3">
            <FileText className="w-12 h-12 mx-auto text-[#DCC3B0]" />
            <p className="font-semibold text-base text-[#3D200F]">Hozircha kitoblar mavjud emas</p>
            <p className="text-xs max-w-sm mx-auto text-[#6E4F39]">
              "Yangi PDF Kitob Yuklash" tugmasini bosib arab tili darsligini yuklang. Tizim uni avtomatik mavzularga ajratadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#E8D8CC] bg-[#FAF4EF] text-[11px] font-bold text-[#6E4F39] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Kitob Nomi</th>
                  <th className="py-3.5 px-4">Hajmi</th>
                  <th className="py-3.5 px-4 text-center">Mavzular Soni</th>
                  <th className="py-3.5 px-4">Biriktirilgan Guruh(lar)</th>
                  <th className="py-3.5 px-4">Yuklangan Sana</th>
                  <th className="py-3.5 px-4 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D8CC]">
                {books.map((book) => (
                  <tr key={book.id} className="hover:bg-[#FAF4EF]/60 transition-colors">
                    <td className="py-4 px-4 font-semibold text-[#3D200F]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-[#3D200F]">{book.title}</div>
                          <div className="text-[11px] text-[#9E7D66] font-mono truncate max-w-xs">
                            {book.pdf_path ? book.pdf_path.split(/[/\\]/).pop() : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs text-[#6E4F39] whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono">
                        <HardDrive className="w-3.5 h-3.5 text-[#9E7D66]" />
                        {formatFileSize(book.file_size)}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => setViewTopicsBook(book)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF4EF] text-[#8C5A3C] hover:bg-[#8C5A3C] hover:text-white border border-[#DCC3B0] transition-all"
                        title="Mavzular ro'yxatini ko'rish"
                      >
                        <Layers className="w-3 h-3" />
                        <span>{book.topics_count || 0} ta mavzu</span>
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      {book.attachedGroups && book.attachedGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {book.attachedGroups.map((g) => (
                            <span
                              key={g.id}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium"
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[#9E7D66] italic">Biriktirilmagan</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-xs text-[#9E7D66] whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#9E7D66]" />
                        {new Date(book.created_at).toLocaleDateString('uz-UZ', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewTopicsBook(book)}
                          className="p-1.5 rounded-lg text-[#6E4F39] hover:bg-[#FAF4EF] hover:text-[#3D200F] transition-colors"
                          title="Mavzularni ko'rish"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setBookToDelete(book);
                            setDeleteModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                          title="Kitobni butunlay o'chirish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Kitob Yuklash Modali */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3">
              <h3 className="font-bold text-[#3D200F] text-base font-heading flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#8C5A3C]" />
                Yangi PDF Darslik Yuklash
              </h3>
              <button
                onClick={() => !uploading && setUploadModalOpen(false)}
                className="p-1 rounded-lg text-[#9E7D66] hover:bg-[#FAF4EF]"
                disabled={uploading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                  Kitob Nomi (ixtiyoriy, kiritilmasa fayl nomi olinadi):
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Masalan: Duruusul Lug'atil Arabiyya 1-jild"
                  className="w-full px-3.5 py-2.5 bg-[#FAF4EF] border border-[#DCC3B0] rounded-xl text-sm text-[#3D200F] focus:outline-none focus:ring-2 focus:ring-[#8C5A3C]"
                  disabled={uploading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1.5">
                  PDF Darslik Fayli:
                </label>
                <div className="border-2 border-dashed border-[#DCC3B0] rounded-xl p-6 bg-[#FAF4EF] text-center hover:border-[#8C5A3C] transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadFile(f);
                        if (!uploadTitle.trim()) {
                          const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                          setUploadTitle(cleanName);
                        }
                      }
                    }}
                    disabled={uploading}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="w-8 h-8 text-[#8C5A3C] mx-auto mb-2 opacity-80" />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-bold text-[#3D200F]">{uploadFile.name}</p>
                      <p className="text-xs text-[#9E7D66] mt-0.5">{formatFileSize(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-[#6E4F39]">
                        PDF faylni tanlash uchun bosing yoki shu yerga tashlang
                      </p>
                      <p className="text-[11px] text-[#9E7D66] mt-1">Faqat .pdf format qabul qilinadi</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Kitob yuklangach, sun'iy intellekt uning barcha sahifalarini tahlil qilib, dars mavzulari (1-mavzu, 2-mavzu...) bo'yicha mustaqil reja tuzib chiqadi.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8D8CC]">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploading}
                  className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-5 py-2 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Yuklanmoqda va Tahlil qilinmoqda...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Kitobni Saqlash</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mavzular Ro'yxati Modali */}
      {viewTopicsBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-2xl p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#8C5A3C]" />
                <div>
                  <h3 className="font-bold text-[#3D200F] text-base font-heading">
                    {viewTopicsBook.title} — Mavzular Rejasi
                  </h3>
                  <p className="text-xs text-[#9E7D66]">
                    Jami {viewTopicsBook.topics_count || 0} ta ketma-ket dars mavzulari
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewTopicsBook(null)}
                className="p-1 rounded-lg text-[#9E7D66] hover:bg-[#FAF4EF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
              {viewTopicsBook.topics && viewTopicsBook.topics.length > 0 ? (
                viewTopicsBook.topics.map((t) => (
                  <div
                    key={t.number}
                    className="p-3 rounded-xl border border-[#E8D8CC] bg-[#FAF4EF]/50 flex items-start gap-3"
                  >
                    <span className="w-7 h-7 rounded-lg bg-[#8C5A3C] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {t.number}
                    </span>
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#3D200F] text-sm">{t.title}</div>
                      {t.summary && (
                        <div className="text-xs text-[#6E4F39] leading-relaxed">{t.summary}</div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-[#9E7D66] text-xs">
                  Mavzular tahlil qilinmoqda yoki topilmadi.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E8D8CC] flex justify-end shrink-0">
              <button
                onClick={() => setViewTopicsBook(null)}
                className="px-5 py-2 bg-[#8C5A3C] text-white rounded-xl text-xs font-bold hover:bg-[#A6714E]"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* O'chirish Tasdiqlash Modali */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Kitobni o'chirish"
        message={
          bookToDelete
            ? `Haqiqatan ham "${bookToDelete.title}" kitobini butunlay o'chirib tashlamoqchimisiz? Ushbu kitob PDF fayli ham, barcha mavzulari ham bazadan o'chiriladi.`
            : ''
        }
        confirmText="Ha, o'chirish"
        cancelText="Bekor qilish"
        isLoading={deleting}
        onConfirm={handleDeleteBook}
        onCancel={() => {
          setDeleteModalOpen(false);
          setBookToDelete(null);
        }}
      />
    </div>
  );
}
