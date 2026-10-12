'use client';

import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ToastContainer, ToastMessage } from '../../components/Toast';

interface PaymentUserItem {
  id: number;
  first_name: string;
  username: string;
  group_name: string;
  is_paid: boolean;
}

export default function PaymentsPage() {
  const [users, setUsers] = useState<PaymentUserItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);
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

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/payments');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
      } else {
        addToast('error', data.message || "To'lovlarni yuklashda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Server bilan aloqa yo'q: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  // To'lov holatini almashtirish (Band 6: [Holatni almashtirish tugmasi])
  const handleToggle = async (userId: number) => {
    try {
      setTogglingId(userId);
      const res = await fetch(`/api/payments/${userId}/toggle`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        addToast('success', data.message);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_paid: data.is_paid } : u))
        );
      } else {
        addToast('error', data.message || "Holatni o'zgartirishda xatolik");
      }
    } catch (err: any) {
      addToast('error', "Xatolik: " + err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    (u.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.group_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const paidCount = users.filter((u) => u.is_paid).length;
  const unpaidCount = users.length - paidCount;

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#3D200F] font-heading flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-[#8C5A3C]" />
            To'lovlar Bo'limi
          </h2>
          <p className="text-sm text-[#6E4F39] mt-0.5">
            Foydalanuvchilar to'lov holatini to'g'ridan-to'g'ri bitta toza ro'yxat orqali belgilang
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="p-2.5 bg-[#FAF4EF] hover:bg-[#F4E8DC] text-[#6E4F39] rounded-xl border border-[#E8D8CC] transition-colors self-start sm:self-auto"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#8C5A3C]' : ''}`} />
        </button>
      </div>

      {/* To'lov hisoboti kartalari */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-[#9E7D66]">Jami O'quvchilar</span>
          <span className="text-xl font-bold text-[#3D200F] font-heading">{users.length} nafar</span>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-[#9E7D66]">To'laganlar</span>
          <span className="text-xl font-bold text-emerald-800 font-heading flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {paidCount}
          </span>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-[#9E7D66]">To'lamaganlar</span>
          <span className="text-xl font-bold text-rose-800 font-heading flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-rose-600" /> {unpaidCount}
          </span>
        </div>
      </div>

      {/* Qidiruv */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#9E7D66] absolute left-3.5 top-3.5" />
        <input
          type="text"
          placeholder="Ism yoki guruh bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#FFFFFF] border border-[#E8D8CC] rounded-xl text-[#3D200F] placeholder-[#9E7D66] focus:outline-none focus:ring-1 focus:ring-[#8C5A3C]"
        />
      </div>

      {/* Toza Ro'yxat Jadvali (Band 6: Ism | Guruh | To'lov holati | [Holatni almashtirish tugmasi]) */}
      <div className="bg-[#FFFFFF] border border-[#E8D8CC] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-[#9E7D66] flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#8C5A3C] mb-2" />
            <span>To'lovlar ro'yxati yuklanmoqda...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-[#9E7D66]">
            Foydalanuvchilar topilmadi
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#3D200F]">
              <thead className="text-xs text-[#9E7D66] uppercase bg-[#FAF4EF] border-b border-[#E8D8CC]">
                <tr>
                  <th className="px-6 py-4">Ism</th>
                  <th className="px-6 py-4">Guruh</th>
                  <th className="px-6 py-4">To'lov Holati</th>
                  <th className="px-6 py-4 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8D8CC]">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FAF4EF]/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-[#3D200F]">
                      {u.first_name}
                      {u.username && (
                        <span className="text-xs text-[#9E7D66] ml-2 font-normal">
                          @{u.username}
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#FAF4EF] text-[#6E4F39] border border-[#E8D8CC]">
                        {u.group_name}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1.5 ${
                          u.is_paid
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {u.is_paid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                        {u.is_paid ? '✅ To\'lagan' : '❌ To\'lamagan'}
                      </span>
                    </td>

                    {/* Holatni almashtirish tugmasi (Band 6) */}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggle(u.id)}
                        disabled={togglingId === u.id}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ml-auto disabled:opacity-50 ${
                          u.is_paid
                            ? 'bg-[#FAF4EF] hover:bg-rose-50 text-rose-700 border border-[#E8D8CC]'
                            : 'bg-[#8C5A3C] hover:bg-[#A6714E] text-white'
                        }`}
                      >
                        {togglingId === u.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        {u.is_paid ? 'Bekor qilish' : 'To\'lovni tasdiqlash'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
