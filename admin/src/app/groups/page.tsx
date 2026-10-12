'use client';

import React, { useEffect, useState } from 'react';
import {
  Users2,
  Plus,
  Trash2,
  Edit,
  Key,
  Loader2,
  X,
  ExternalLink,
  BookOpen,
  Upload,
  BookMarked,
  Check,
  Unlink,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

interface GroupItem {
  id: number;
  name: string;
  access_code: string;
  telegram_invite_link: string;
  description: string;
  book_name?: string;
  book_pdf_path?: string;
  book_topics?: any;
  members_count: number;
  avg_grade: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    access_code: '',
    telegram_invite_link: '',
    description: '',
    book_name: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // O'chirish
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // PDF Kitob yuklash
  const [uploadingPdfGroupId, setUploadingPdfGroupId] = useState<number | null>(null);

  // Kutubxonadan kitob biriktirish (Band 2: 1-bosish bilan va izolyatsiyalangan holda)
  const [libraryBooks, setLibraryBooks] = useState<any[]>([]);
  const [selectBookGroup, setSelectBookGroup] = useState<GroupItem | null>(null);
  const [attachingBookLoading, setAttachingBookLoading] = useState(false);
  const [detachingGroupId, setDetachingGroupId] = useState<number | null>(null);

  const handleUploadBookPdf = async (groupId: number, file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      addToast('error', 'Faqat PDF formatdagi fayllarni yuklash mumkin!');
      return;
    }
    try {
      setUploadingPdfGroupId(groupId);
      const formData = new FormData();
      formData.append('book_pdf', file);

      const res = await fetch(`/api/groups/${groupId}/upload-book`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', `PDF kitob yuklandi va ${data.topicsCount || 0} ta mavzuga ajratildi!`);
        fetchGroups();
      } else {
        addToast('error', data.error || 'Kitob yuklashda xatolik yuz berdi');
      }
    } catch (err: any) {
      addToast('error', 'Yuklashda xatolik: ' + err.message);
    } finally {
      setUploadingPdfGroupId(null);
    }
  };

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

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const [grpRes, booksRes] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/books'),
      ]);
      const gData = await grpRes.json();
      const bData = await booksRes.json();
      if (gData.success) {
        setGroups(gData.data || []);
      }
      if (bData.success) {
        setLibraryBooks(bData.data || []);
      }
    } catch (err: any) {
      addToast('error', "Guruhlarni yuklashda xatolik: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachBookToGroup = async (groupId: number, bookId: number) => {
    try {
      setAttachingBookLoading(true);
      const res = await fetch(`/api/groups/${groupId}/attach-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', data.message || "Kitob faqat ushbu guruhga muvaffaqiyatli biriktirildi!");
        setSelectBookGroup(null);
        fetchGroups();
      } else {
        addToast('error', data.message || "Kitobni biriktirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setAttachingBookLoading(false);
    }
  };

  const handleDetachBookFromGroup = async (groupId: number) => {
    try {
      setDetachingGroupId(groupId);
      const res = await fetch(`/api/groups/${groupId}/detach-book`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        addToast('success', "Kitob ushbu guruhdan uzildi");
        fetchGroups();
      } else {
        addToast('error', data.message || "Uzishda xatolik");
      }
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setDetachingGroupId(null);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const openCreateModal = () => {
    setEditingGroup(null);
    setForm({
      name: '',
      access_code: 'ARAB' + Math.floor(100 + Math.random() * 900),
      telegram_invite_link: '',
      description: '',
      book_name: '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (grp: GroupItem) => {
    setEditingGroup(grp);
    setForm({
      name: grp.name || '',
      access_code: grp.access_code || '',
      telegram_invite_link: grp.telegram_invite_link || '',
      description: grp.description || '',
      book_name: grp.book_name || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!form.name.trim()) errors.name = "Guruh nomi kiritilishi shart!";
    if (!form.access_code.trim()) errors.access_code = "Kirish kodi kiritilishi shart!";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      addToast('error', "Iltimos, maydonlarni to'ldiring!");
      return;
    }

    try {
      setSaving(true);
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups';
      const method = editingGroup ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        addToast('success', "✅ " + data.message);
        setModalOpen(false);
        await fetchGroups();
      } else {
        addToast('error', data.message || "Saqlashda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Server xatosi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (grp: GroupItem) => {
    setGroupToDelete(grp);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/groups/${groupToDelete.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast('success', "✅ " + data.message);
        setDeleteModalOpen(false);
        setGroupToDelete(null);
        await fetchGroups();
      } else {
        addToast('error', data.message || "O'chirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Xatolik: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Guruhni o'chirish"
        message={`"${groupToDelete?.name}" guruhini rostdan ham o'chirmoqchimisiz?`}
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#3D200F] font-heading flex items-center gap-2.5">
            <Users2 className="w-6 h-6 text-[#8C5A3C]" />
            Guruhlar Boshqaruvi
          </h2>
          <p className="text-sm text-[#6E4F39] mt-0.5">
            Guruhlarni yaratish, kirish kodini belgilash va Telegram havolalarini sozlash
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Yangi Guruh Yaratish
        </button>
      </div>

      {/* Guruhlar Kartalari */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-[#9E7D66] flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
            <span>Guruhlar yuklanmoqda...</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="col-span-full bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-12 text-center text-[#9E7D66]">
            Hozircha guruhlar mavjud emas. Yuqoridagi tugma orqali birinchi guruhni yarating.
          </div>
        ) : (
          groups.map((grp) => (
            <div
              key={grp.id}
              className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-5 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-[#3D200F] text-base font-heading">
                    {grp.name}
                  </h3>
                  <span className="text-[11px] font-bold text-[#6E4F39] px-2 py-0.5 rounded-full bg-[#FAF4EF] border border-[#E8D8CC]">
                    {grp.members_count || 0} o'quvchi
                  </span>
                </div>

                {grp.description && (
                  <p className="text-xs text-[#6E4F39] mt-1.5 line-clamp-2">
                    {grp.description}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-[#E8D8CC] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#9E7D66] flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-[#8C5A3C]" /> Kirish Kodi:
                    </span>
                    <span className="font-mono font-bold text-[#8C5A3C] bg-[#FAF4EF] px-2 py-0.5 rounded border border-[#E8D8CC]">
                      {grp.access_code}
                    </span>
                  </div>

                  {grp.book_name && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[#9E7D66] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#8C5A3C]" /> Bog'langan kitob:
                      </span>
                      <span className="font-semibold text-[#3D200F] truncate max-w-[150px]" title={grp.book_name}>
                        {grp.book_name}
                      </span>
                    </div>
                  )}

                  {grp.book_pdf_path ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[#9E7D66] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> PDF Darslik:
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {Array.isArray(grp.book_topics) ? `${grp.book_topics.length} ta mavzu` : 'Biriktirilgan'}
                      </span>
                    </div>
                  ) : null}

                  {grp.telegram_invite_link && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[#9E7D66]">Telegram havola:</span>
                      <a
                        href={grp.telegram_invite_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#8C5A3C] hover:underline flex items-center gap-1 font-medium truncate max-w-[130px]"
                      >
                        Guruh linki <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#E8D8CC] flex items-center justify-end gap-2 flex-wrap">
                {/* Agar kitob biriktirilgan bo'lsa, uzish tugmasi */}
                {grp.book_pdf_path && (
                  <button
                    onClick={() => handleDetachBookFromGroup(grp.id)}
                    disabled={detachingGroupId === grp.id}
                    className="p-1.5 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
                    title="Kitobni guruhdan uzish"
                  >
                    {detachingGroupId === grp.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Unlink className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* Kutubxonadan tanlash tugmasi */}
                <button
                  onClick={() => setSelectBookGroup(grp)}
                  className="px-2.5 py-1.5 bg-[#FAF4EF] hover:bg-[#F4E8DC] text-[#6E4F39] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#E8D8CC]"
                  title="Kutubxonadagi mavjud kitoblardan tanlash"
                >
                  <BookMarked className="w-3.5 h-3.5 text-[#8C5A3C]" />
                  <span>Kutubxona</span>
                </button>

                <label className="px-2.5 py-1.5 bg-[#FAF4EF] hover:bg-[#F4E8DC] text-[#6E4F39] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#E8D8CC] cursor-pointer">
                  {uploadingPdfGroupId === grp.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C5A3C]" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-[#8C5A3C]" />
                  )}
                  <span>{grp.book_pdf_path ? 'PDF almashtirish' : 'PDF Yuklash'}</span>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadBookPdf(grp.id, file);
                      e.target.value = '';
                    }}
                    disabled={uploadingPdfGroupId === grp.id}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => openEditModal(grp)}
                  className="px-2.5 py-1.5 bg-[#FAF4EF] hover:bg-[#F4E8DC] text-[#6E4F39] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#E8D8CC]"
                >
                  <Edit className="w-3.5 h-3.5 text-[#8C5A3C]" /> Tahrirlash
                </button>
                <button
                  onClick={() => confirmDelete(grp)}
                  className="p-1.5 text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-200"
                  title="O'chirish"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8D8CC]">
              <h3 className="text-base font-bold text-[#3D200F] font-heading flex items-center gap-2">
                <Users2 className="w-5 h-5 text-[#8C5A3C]" />
                {editingGroup ? "Guruhni Tahrirlash" : "Yangi Guruh Yaratish"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-[#9E7D66] hover:text-[#3D200F]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  Guruh Nomi *
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Boshlang'ich A-1 Guruh"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`w-full px-3.5 py-2.5 text-sm bg-[#FAF4EF] border rounded-xl text-[#3D200F] focus:outline-none focus:ring-1 focus:ring-[#8C5A3C] ${
                    formErrors.name ? 'border-rose-500' : 'border-[#E8D8CC]'
                  }`}
                />
                {formErrors.name && (
                  <span className="text-[11px] text-rose-600 mt-1 block">{formErrors.name}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  Kirish Maxsus Kodi (Access Code) *
                </label>
                <input
                  type="text"
                  placeholder="Masalan: ARAB77"
                  value={form.access_code}
                  onChange={(e) => setForm({ ...form, access_code: e.target.value.toUpperCase() })}
                  className={`w-full px-3.5 py-2.5 text-sm bg-[#FAF4EF] border rounded-xl text-[#8C5A3C] font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#8C5A3C] ${
                    formErrors.access_code ? 'border-rose-500' : 'border-[#E8D8CC]'
                  }`}
                />
                {formErrors.access_code && (
                  <span className="text-[11px] text-rose-600 mt-1 block">{formErrors.access_code}</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#8C5A3C]" />
                  Kitob Bog'lash (AI Ustoz uchun)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: Mabda ul-Qiroat, Durusul Lugha, Bayna Yadayk..."
                  value={form.book_name}
                  onChange={(e) => setForm({ ...form, book_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-[#3D200F] focus:outline-none focus:ring-1 focus:ring-[#8C5A3C]"
                />
                <p className="text-[11px] text-[#9E7D66] mt-1">
                  AI Ustoz ushbu guruh o'quvchilariga aynan shu darslik asosida ketma-ket dars o'tadi.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">
                  Telegram Guruh Taklif Havolasi (Invite Link)
                </label>
                <input
                  type="text"
                  placeholder="https://t.me/+..."
                  value={form.telegram_invite_link}
                  onChange={(e) => setForm({ ...form, telegram_invite_link: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-[#3D200F] focus:outline-none focus:ring-1 focus:ring-[#8C5A3C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6E4F39] mb-1">Tavsif</label>
                <textarea
                  rows={2}
                  placeholder="Guruh haqida qisqacha ma'lumot..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF4EF] border border-[#E8D8CC] rounded-xl text-[#3D200F] focus:outline-none focus:ring-1 focus:ring-[#8C5A3C] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E8D8CC]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-[#9E7D66] hover:text-[#3D200F]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kutubxonadan Guruhga Kitob Biriktirish Modali (Band 2: 1-bosish bilan va izolyatsiyalangan holda) */}
      {selectBookGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E8D8CC] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-[#8C5A3C]" />
                <div>
                  <h3 className="font-bold text-[#3D200F] text-base font-heading">
                    "{selectBookGroup.name}" Guruhiga Kitob Biriktirish
                  </h3>
                  <p className="text-xs text-[#9E7D66]">
                    Kitob faqat ushbu guruhga biriktiriladi (boshqa guruhlarga ta'sir qilmaydi)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectBookGroup(null)}
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
                        {bk.topics_count || 0} ta dars mavzusi · {Math.round(bk.file_size / 1024)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleAttachBookToGroup(selectBookGroup.id, bk.id)}
                      disabled={attachingBookLoading}
                      className="px-3.5 py-1.5 bg-[#8C5A3C] hover:bg-[#A6714E] text-white rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1 disabled:opacity-50"
                    >
                      {attachingBookLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Biriktirish</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E8D8CC] flex justify-end shrink-0">
              <button
                onClick={() => setSelectBookGroup(null)}
                className="px-4 py-2 border border-[#E8D8CC] text-[#6E4F39] rounded-xl text-xs font-semibold hover:bg-[#FAF4EF]"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
