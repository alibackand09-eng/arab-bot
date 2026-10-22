# Arab Tili Boti va Admin Paneli — Versiya 4.0 🌟

Arab tili o'quv markazi uchun grammY Telegram boti va uning API backend'i.

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

```powershell
# arab-bot papkasiga kiring
cd arab-bot

# Maxfiy sozlamalar shablonidan lokal .env yarating
Copy-Item .env.example .env

# .env faylida kamida BOT_TOKEN va ADMIN_ID qiymatlarini to'ldiring

# Bog'liqliklarni o'rnating
npm install

# Bot va API'ni ishga tushiring
npm start
```

- 🌐 **Backend API**: `http://localhost:5000`
- Admin boshqaruvi asosiy saytning yagona admin panelida amalga oshiriladi.
- `.env` maxfiy ma'lumot saqlagani uchun `.gitignore` ichida va `git clone` bilan kelmaydi. `.env.example` nusxasidan `.env` yarating; haqiqiy token yoki parollarni GitHub'ga yubormang.
- Bot tokenisiz API ishga tushishi mumkin, ammo Telegram bot ishlamaydi. `.env` ichidagi `BOT_TOKEN`ga @BotFather bergan tokenni kiriting.
- `DATABASE_URL` bo'sh qolsa lokal SQLite avtomatik ishlatiladi.

---

## 🎯 Bot Imkoniyatlari (v4)

1. **`/start`** → 🇺🇿 O'zbek | 🇷🇺 Русский | 🇬🇧 English.
   - Tanlangach kurslar haqida narxlarsiz ma'lumot ko'rsatiladi.
2. **`/review`** → o'quvchi sharhini sayt adminiga tasdiqlash uchun yuboradi.
2. **📊 Statistika — Guruh bo'yicha va O'rin bilan**:
   - Foydalanuvchi avval o'z guruhini tanlaydi.
   - Shu guruhdagi barcha o'quvchilar ichida **nechinchi o'rinda turgani** (masalan, `1-o'rin (15 ta o'quvchi ichida)`) va qo'yilgan bahosi (`⭐️ 5 / 5`) ko'rsatiladi. Har guruh statistikasi alohida.
3. **🧑‍🏫 Ustozlar uchun cheklangan kirish (`/ustoz`)**:
   - Ustoz botda `/ustoz` buyrug'i va parolni (standart: `123`, `.env`dagi `TEACHER_ACCESS_CODE`) kiritadi.
   - Ustozga **faqat baho qo'yish** imkoniyati beriladi: guruhni tanlaydi -> o'quvchini tanlaydi -> 1 dan 5 gacha baho qo'yadi.
4. **📞 Aloqa va Yordam**:
   - Admin Telegram havolasi (`ADMIN_TELEGRAM_CONTACT`) ko'rsatiladi.
5. **👥 Guruhlar**:
   - Guruh tanlanganda kirish kodi so'raladi va to'g'ri bo'lsa qabul qilinadi.
6. **📝 Test**:
   - Daraja aniqlash testi.

---

## 🔗 Sayt bilan ulanish

Botni sayt bilan doimiy ulash uchun bot service environment'ida quyidagilarni sozlang:

```env
ACADEMY_API_URL=https://arabic-academy.onrender.com
ACADEMY_ADMIN_URL=https://arabic-academy.onrender.com/admin
ACADEMY_SYNC_SECRET=<site bilan bir xil kuchli sir>
ADMIN_TELEGRAM_CONTACT=<@aishauzbikiyya_admin>
```

- Botdagi statistika sayt admin paneliga har 30 soniyada yuboriladi.
- `/review` orqali yuborilgan sharhlar sayt admini tasdiqlamaguncha ommaga ko'rinmaydi.
- `/admin` botdagi admin ID uchun saytning yagona admin panel havolasini beradi.
- Bot service bilan sayt service'dagi `BOT_SYNC_SECRET` qiymati bir xil bo'lishi kerak.
- O'quvchi botdagi statistika bo'limida sayt guruhlaridagi o'z baholari va reytingini ko'rishi uchun `ACADEMY_SYNC_SECRET` qiymatini sayt backend'idagi `BOT_SYNC_SECRET` bilan aynan bir xil qiling.
- Telegram bot faqat shu `arab-bot` servisida ishlashi kerak. Sayt backend'ida ham bot polling ishlayotgan eski deploy bo'lsa, saytni qayta deploy qiling va `BOT_TOKEN`ni faqat bot service'da qoldiring; aks holda Telegram `409 Conflict` qaytarishi mumkin.
