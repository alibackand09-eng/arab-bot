# Arab Tili Boti va Admin Paneli — Versiya 4.0 🌟

Arab tili o'quv markazi uchun telegram boti (grammY) va Next.js zamonaviy Admin paneli.

---

## 🎨 Yangi Dizayn Tizimi (Warm Terracotta & Arabic Elegance)

- **Ranglar**:
  - Sahifa foni: `#F7EFE9` (Warm Cream)
  - Matnlar: `#3D200F` (Deep Espresso), `#6E4F39` (Soft Brown)
  - Asosiy urg'u (Accent): `#8C5A3C` (Terracotta Brown), `#FAF4EF` (Card Panel)
  - Oltin aksent: `#C59858`
- **Shriftlar**: Google Fonts (Amiri, Playfair Display, Plus Jakarta Sans).
- Hech qanday texnologiya ko'rsatkichlari (Gemini Active, Node.js va h.k.) ko'rsatilmaydi — toza, minimalistik va professional interfeys.

---

## 🚀 Ishga Tushirish

Loyihani bitta buyruq bilan ishga tushirish mumkin:

```bash
# 1. Bog'liqliklarni o'rnatish
npm install

# 2. Tizimni to'liq ishga tushirish (Bot + Backend + Admin Panel)
npm start
```

- 💻 **Admin Panel**: `http://localhost:3000`
- 🌐 **Backend API**: `http://localhost:5000`

---

## 🎯 Bot Imkoniyatlari (v4)

1. **`/start`** → 🇺🇿 O'zbek | 🇷🇺 Русский | 🇬🇧 English.
   - Tanlangach kurslar haqida ma'lumot va **to'lov narxlari aniq ko'rsatiladi**:
     - Boshlang'ich Arab tili: **250 000 so'm / oy**
     - Sarf va Nahv: **350 000 so'm / oy**
     - Fusha So'zlashuv: **300 000 so'm / oy**
2. **📊 Statistika — Guruh bo'yicha va O'rin bilan**:
   - Foydalanuvchi avval o'z guruhini tanlaydi.
   - Shu guruhdagi barcha o'quvchilar ichida **nechinchi o'rinda turgani** (masalan, `1-o'rin (15 ta o'quvchi ichida)`) va qo'yilgan bahosi (`⭐️ 5 / 5`) ko'rsatiladi. Har guruh statistikasi alohida.
3. **🧑‍🏫 Ustozlar uchun cheklangan kirish (`/ustoz`)**:
   - Ustoz botda `/ustoz` buyrug'i va parolni (standart: `123`, `.env`dagi `TEACHER_ACCESS_CODE`) kiritadi.
   - Ustozga **faqat baho qo'yish** imkoniyati beriladi: guruhni tanlaydi -> o'quvchini tanlaydi -> 1 dan 5 gacha baho qo'yadi.
4. **📞 Aloqa va Yordam**:
   - `.env`dagi telefon raqami (`SUPPORT_PHONE`) va admin Telegram havolasi (`ADMIN_TELEGRAM_CONTACT`) ko'rsatiladi.
5. **👥 Guruhlar**:
   - Guruh tanlanganda kirish kodi so'raladi va to'g'ri bo'lsa qabul qilinadi.
6. **📝 Test**:
   - Daraja aniqlash testi.

---

## 🖥 Admin Panel Imkoniyatlari (v4)

1. **📊 Boshqaruv & Reyting (`/`)**:
   - Jami o'quvchilar, guruhlar, to'lovlar va baholanganlar ko'rsatkichi.
   - Har bir guruh bo'yicha kuchli, dinamik reyting va top o'quvchilar.
2. **👥 Guruhlar (`/groups`)**:
   - Guruh yaratish, o'chirish, kirish kodini o'zgartirish (video yuklashsiz, tez va qulay).
3. **🎓 O'quvchilar & Baholar (`/students`)**:
   - O'quvchi qo'shish va bir bosishda **1 dan 5 gacha baho qo'yish** (⭐️ 1..5).
4. **💳 To'lovlar (`/payments`)**:
   - Toza ro'yxat: `Ism | Guruh | To'lov holati | [Holatni almashtirish tugmasi]`.
   - Telegram ID ko'rsatilmaydi, dublikatsiz toza jadval.
5. **⚙️ Sozlamalar**:
   - Bot tokeni va Gemini kaliti UI orqali emas, faqat `.env` fayli orqali xavfsiz boshqariladi.
