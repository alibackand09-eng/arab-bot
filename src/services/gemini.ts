import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { db } from '../db/index.js';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic?: string;
}

export interface QuizGenerationOptions {
  difficulty?: 'easy' | 'medium' | 'hard';
  hasStats?: boolean;
  userScoreSummary?: string;
  weakTopics?: string[];
  isNewUser?: boolean;
  excludedQuestions?: string[];
  repeatQuestions?: string[];
}

/**
 * Variant matnlarini tozalash va dublikatlardan xoli qilish:
 * - "A) ", "B. ", "🅰️ " kabi prefikslarni olib tashlaydi
 * - Har bir variant takrorlanmasligini (unikal) kafolatlaydi
 * - Aynan 4 ta variant bo'lishini ta'minlaydi
 */
function sanitizeQuizQuestion(rawQ: any): QuizQuestion | null {
  if (!rawQ || typeof rawQ.question !== 'string') return null;

  const rawOptions = Array.isArray(rawQ.options) ? rawQ.options : [];
  if (rawOptions.length < 2) return null;

  const cleanOpt = (opt: any): string => {
    if (typeof opt !== 'string') return '';
    return opt
      // Harf / raqam / belgi prefikslarini tozalash (masalan: "A)", "B.", "1.", "🅰️ ")
      .replace(/^(?:[A-DА-Дa-dа-д1-4][:.)\s-]+|[🅰️🅱️🅲️🅳️\u{1F170}-\u{1F189}]\s*)/u, '')
      .trim();
  };

  const cleanedOptions: string[] = rawOptions.map(cleanOpt).filter(Boolean);
  const correctRawIndex = typeof rawQ.correctIndex === 'number' ? rawQ.correctIndex : 0;
  const correctText = cleanedOptions[correctRawIndex] || cleanedOptions[0];

  // Unikal variantlar ro'yxati (dublikatlarni qat'iy yo'qotish)
  const uniqueOptions: string[] = [];
  for (const opt of cleanedOptions) {
    if (!uniqueOptions.includes(opt)) {
      uniqueOptions.push(opt);
    }
  }

  // Agar 4 tadan kam bo'lsa, mantiqiy to'ldiruvchilar bilan to'ldiramiz (dublikatsiz)
  const fillers = [
    "To'g'ri javob keltirilmagan",
    "Barcha javoblar noto'g'ri",
    "Ushbu qoidaga to'g'ri kelmaydi",
    "Qo'shimcha tekshirish zarur"
  ];
  for (const filler of fillers) {
    if (uniqueOptions.length >= 4) break;
    if (!uniqueOptions.includes(filler)) {
      uniqueOptions.push(filler);
    }
  }

  // Aynan 4 ta variant qoldiramiz
  const finalOptions = uniqueOptions.slice(0, 4);
  if (finalOptions.length < 4) return null;

  let newCorrectIndex = finalOptions.indexOf(correctText);
  if (newCorrectIndex === -1) {
    newCorrectIndex = 0;
  }

  return {
    question: rawQ.question.trim(),
    options: finalOptions,
    correctIndex: newCorrectIndex,
    explanation: typeof rawQ.explanation === 'string' ? rawQ.explanation.trim() : '',
    topic: typeof rawQ.topic === 'string' ? rawQ.topic.trim() : 'Arab tili',
  };
}

export class GeminiService {
  /**
   * Mavjud barcha API kalitlarni oladi (Asosiy va Zahira GEMINI_API_KEY_2)
   */
  private static getApiKeys(): string[] {
    const keys: string[] = [];
    const k1 = (config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    const k2 = (config.geminiApiKey2 || process.env.GEMINI_API_KEY_2 || '').trim();
    if (k1) keys.push(k1);
    if (k2 && k2 !== k1) keys.push(k2);
    return keys;
  }

  /**
   * Arab tili daraja aniqlash va mashq testi uchun savollar generatsiya qilish
   * - Savol qayta takrorlanmaydi (excludedQuestions orqali qat'iy cheklanadi)
   * - Faqat xato qilingan savollar mustahkamlash uchun qayta berilishi mumkin (repeatQuestions)
   * - Savollar qiziqarli, foydali, dars mavzusidan chetga chiqmagan holda foydalanuvchining bilim darajasini aniqlaydi
   */
  public static async generateTestQuestions(
    lang: string = 'uz',
    options?: QuizGenerationOptions
  ): Promise<QuizQuestion[]> {
    const apiKeys = this.getApiKeys();

    if (apiKeys.length === 0) {
      console.log('ℹ️ [Gemini] API kalit .env da topilmadi, ichki bazadagi zaxira test savollari berilmoqda.');
      return this.getFilteredFallbackQuestions(lang, options?.excludedQuestions);
    }

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-2.5-pro',
    ];

    // Qiyinlik darajasini belgilash (Statistika jadvalidan olingan ma'lumot asosida)
    let difficultyInstruction = '';
    if (options?.hasStats) {
      if (options.difficulty === 'hard') {
        difficultyInstruction = `\nFOYDALANUVCHI DARAJASI: Foydalanuvchi statistika jadvalida YUQORI ballga ega! Savollarni B1-B2 darajasida tuzing: murakkab nahv (e'rob, jumla tahlili), sarf (fe'l boblari, vaznlar) va boy arab tili lug'atiga oid savollar bo'lsin.`;
      } else if (options.difficulty === 'easy') {
        difficultyInstruction = `\nFOYDALANUVCHI DARAJASI: Foydalanuvchi statistika jadvalida PAST ballga ega. Savollarni A1 boshlang'ich darajasida tuzing: arab harflari, maxrajlar, harakatlar (fatha, kasra, damma, sukun, tanvin) va kundalik oson so'zlar bo'lsin.`;
      } else {
        difficultyInstruction = `\nFOYDALANUVCHI DARAJASI: Foydalanuvchi o'rta darajada. Savollar oddiy, o'rta qiyinlikda (A2 darajasi, sodda gaplar, asosiy grammatika va tushunarli matnlar) bo'lsin.`;
      }
    } else {
      difficultyInstruction = `\nFOYDALANUVCHI DARAJASI: Foydalanuvchi yangi o'quvchi. Savollarni o'rta-boshlang'ich darajada tuzing: arab tili tushunchalari, asosiy qoidalar va so'zlar.`;
    }

    let weaknessInstruction = '';
    if (options?.weakTopics && options.weakTopics.length > 0) {
      weaknessInstruction = `\nFoydalanuvchi quyidagi mavzularda ko'proq xato qilmoqda: ${options.weakTopics.join(', ')}. Ushbu mavzulardan savollar kiritishga e'tibor qarating.`;
    }

    // Takrorlanmaslik va faqat xatolarni takrorlash qoidasi
    let repetitionInstruction = '';
    if (options?.excludedQuestions && options.excludedQuestions.length > 0) {
      repetitionInstruction += `\n⚠️ MUHIM QOIDA — SAVOLLAR TAKRORLANMASIN:\nFoydalanuvchi quyidagi savollarga ilgari TO'G'RI javob bergan. Ushbu savollarni (yoki ularning aynan nusxasini) MUTLAQO QAYTA BERMANG:\n` +
        options.excludedQuestions.slice(0, 30).map((q, idx) => `${idx + 1}. "${q}"`).join('\n') +
        `\nMutlaqo YANGI, qiziqarli va boshqacha savollar tuzing!`;
    }

    if (options?.repeatQuestions && options.repeatQuestions.length > 0) {
      repetitionInstruction += `\n📌 TAKRORLASH / MUSTAHKAMLASH:\nFoydalanuvchi ilgari quyidagi savollarda XATO qilgan: \n` +
        options.repeatQuestions.slice(0, 5).map((q, idx) => `• "${q}"`).join('\n') +
        `\nFaqat bilimni mustahkamlash maqsadida shu xato qilingan qoida yoki savollardan birini qayta kiritishingiz mumkin.`;
    }

    const langRules = {
      ru: "Все вопросы, варианты ответов и пояснения должны быть НА РУССКОМ ЯЗЫКЕ (арабские слова и буквы пишите арабской вязью с огласовками).",
      en: "All questions, options, and explanations must be written IN ENGLISH (Arabic words and letters in Arabic script with harakat).",
      uz: "Barcha savollar, variantlar va izohlar TOZA O'ZBEK TILIDA bo'lsin (arabcha so'z va harflar arab yozuvida to'liq harakatlari bilan berilsin).",
    };
    const activeLangRule = langRules[lang as 'ru' | 'en' | 'uz'] || langRules.uz;

    const prompt = `Siz professional Arab tili ustozi va metodistisiz.
Arab tilini o'rganuvchilar uchun 5 ta QIZIQARLI, FOYDALI va dars mavzusidan chetga chiqmagan holda bilim darajasini aniq belgilovchi ko'p variantli (multiple-choice) test savolini tuzib bering.
${difficultyInstruction}
${weaknessInstruction}
${repetitionInstruction}

QAT'IY TALABLAR:
1. Har bir savolda AYNAN 4 TA variant bo'lishi SHART.
2. Variantlar bir-birini takrorlamasligi (mutlaqo unikal bo'lishi) SHART. Hech qanday dublikat javob bo'lmasin.
3. Variant matnlariga "A)", "B)", "1)", "🅰️" kabi prefikslarni QO'SHMANG! Faqat javob matnining o'zini yozing.
4. "correctIndex" 0, 1, 2 yoki 3 bo'lsin.
5. Har bir savolga to'liq va tushunarli "explanation" (izoh: nima uchun aynan shu javob to'g'ri ekanligi) yozing.
6. Har bir savolga qisqa "topic" (masalan: "Alifbo", "Harakatlar", "Lug'at", "Nahv", "Sarf") biriktiring.
7. Muloqot tili: ${activeLangRule}

Javobni FAQAT toza JSON massiv ko'rinishida qaytaring:
[
  {
    "question": "Savol matni",
    "options": ["Variant 1", "Variant 2", "Variant 3", "Variant 4"],
    "correctIndex": 0,
    "explanation": "To'g'ri javob izohi",
    "topic": "Alifbo"
  }
]`;

    // Har bir API kalit bo'yicha ketma-ket urinib ko'ramiz (Zahira kalit mexanizmi)
    for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
      const activeKey = apiKeys[keyIdx];
      const isBackupKey = keyIdx > 0;
      if (isBackupKey) {
        console.log(`🔄 [Gemini AI] Asosiy kalit xatosi tufayli zahira kalitga (GEMINI_API_KEY_2) o'tildi...`);
      }

      const ai = new GoogleGenerativeAI(activeKey);

      for (const modelName of candidateModels) {
        try {
          const model = ai.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          let text = result.response.text().trim();

          const firstBracket = text.indexOf('[');
          const lastBracket = text.lastIndexOf(']');
          if (firstBracket !== -1 && lastBracket !== -1) {
            text = text.slice(firstBracket, lastBracket + 1);
          } else {
            text = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          }

          const parsedRaw = JSON.parse(text);
          if (Array.isArray(parsedRaw) && parsedRaw.length >= 3) {
            const sanitizedList: QuizQuestion[] = [];
            for (const item of parsedRaw) {
              const cleanQ = sanitizeQuizQuestion(item);
              if (cleanQ) {
                sanitizedList.push(cleanQ);
              }
            }

            if (sanitizedList.length >= 3) {
              console.log(`✅ [Gemini AI] ${sanitizedList.length} ta sifatli va takrorlanmas test savoli (${modelName}) orqali generatsiya qilindi!`);
              return sanitizedList.slice(0, 5);
            }
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const isQuota = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota');
          console.warn(`⚠️ [Gemini AI] Model ${modelName} (kalit #${keyIdx + 1}) xatosi: ${errMsg}`);

          if (isQuota && keyIdx < apiKeys.length - 1) {
            break;
          }
        }
      }
    }

    console.warn('⚠️ [Gemini AI] Barcha kalitlar va modellar sinab ko\'rildi, zaxira savollarga o\'tildi.');
    return this.getFilteredFallbackQuestions(lang, options?.excludedQuestions);
  }

  /**
   * Gemini AI Arab tili ustozi — Erkin savol-javob
   * - Chegaradan chiqmaslik (faqat arab tili ta'limiga oid)
   * - Har bir guruhda "Kitob bog'lash" imkoniyati: kitob nomi berilsa, shu kitob asosida dars o'tadi
   * - Javoblar na juda uzun, na juda qisqa (o'rtacha, tushunarli)
   */
  public static async askArabicTutor(
    question: string,
    lang: string = 'uz',
    bookName?: string,
    currentTopicTitle?: string
  ): Promise<string> {
    const apiKeys = this.getApiKeys();
    if (apiKeys.length === 0) {
      return lang === 'ru'
        ? "Извините, сервис временно недоступен. Пожалуйста, обратитесь к администратору."
        : "Kechirasiz, xizmat sozlamalari yangilanmoqda. Iltimos, administratorga murojaat qiling.";
    }

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-2.5-pro',
    ];

    const langInstruction =
      lang === 'ru'
        ? "Отвечай вежливо и понятно на русском языке, арабские слова приводи с огласовками (харакатами) и переводом."
        : lang === 'en'
        ? "Answer politely and clearly in English, provide Arabic words with full vocalization (harakat) and translations."
        : "Javobni samimiy, tushunarli va toza o'zbek tilida ber. Arabcha so'z va misollarni arab yozuvida to'liq harakatlari bilan keltir.";

    const currentTopicPrompt = currentTopicTitle ? `Joriy dars mavzusi: "${currentTopicTitle}".` : '';

    const systemPrompt = `Siz faqat "AI Ustoz"siz. Hech qachon o'zingizni "Gemini" yoki texnologik AI deb tanitmang. Sizning yagona nomingiz: "AI Ustoz".
Kitob nomi va muallifi o'quvchiga MUTLAQO SIR!
${currentTopicPrompt}

QAT'IY QOIDALAR:
1. SOHAGA VA DARS MAVZUSIGA CHEKLANISH: Siz FAQAT darslikdagi arab tili darsi mavzusi bo'yicha tushuntirasiz.
2. BEGONA SAVOLLARGA JAVOB BERMASLIK (QAT'IY):
Agar o'quvchi dars mavzusiga kirmaydigan har qanday begona savol bersa (boshqa fanlar, dunyoviy erkin suhbat, yoki hatto kitobdagi joriy mavzuga kirmaydigan boshqa begona tushunchalar haqida so'rasa), QAT'IYAN BOSHQA MAVZULARGA CHALG'IMANG!
Aniq shunday javob bering:
"Bu dars mavzusiga kirmaydi. Keling, joriy darsimizga qaytamiz${currentTopicTitle ? `: ${currentTopicTitle}` : ''}. Ushbu mavzu bo'yicha qanday savolingiz bor?"
3. Kitobda bo'lmagan atama, qoida yoki tushunchalarni (masalan maxraj yoki tashqi murakkab qoidalar kitobda yo'q bo'lsa) mutlaqo tilga olmang!
4. Ohang: Jonli, samimiy, iliq, o'quvchini qo'llab-quvvatlovchi haqiqiy ustoz.
5. Muloqot tili: ${langInstruction}

O'quvchining murojaati:
${question}`;

    for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
      const activeKey = apiKeys[keyIdx];
      const ai = new GoogleGenerativeAI(activeKey);

      for (const modelName of candidateModels) {
        try {
          const model = ai.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(systemPrompt);
          const answer = result.response.text().trim();
          if (answer) {
            return answer;
          }
        } catch (err: any) {
          console.warn(`⚠️ [AI Tutor] Model ${modelName} xatosi:`, err?.message || err);
        }
      }
    }

    return lang === 'ru'
      ? "Извините, не удалось получить ответ в данный момент. Попробуйте еще раз позже."
      : "Kechirasiz, ayni damda javob tayyorlashda kechikish bo'ldi. Iltimos, birozdan so'ng qayta urinib ko'ring.";
  }

  /**
   * AI Ustoz — Ketma-ket dars tushuntirish va mavzu bo'yicha 1 ta tekshiruv savolini berish
   * TALAB:
   * - Har bir guruhga yuklangan PDF darslikdan 1-mavzudan boshlab ketma-ket dars o'tiladi.
   * - Dars matni, tushuntirish va savollar FAQAT o'sha kitob ichidagi ma'lumotdan olinadi.
   * - Kitobda bo'lmagan atama, qoida yoki tushuncha (masalan maxraj va h.k.) darsda mutlaqo tilga olinmaydi.
   * - Nomi: "AI Ustoz", Gemini nomi yoki kitob nomi mutlaqo sir saqlanadi.
   * - Har mavzudan keyin bitta savol beriladi.
   */
  public static async teachTopicLesson(
    topic: { number: number; title: string; summary: string; rules: string },
    studentName: string,
    lang: string = 'uz',
    bookExcerpt?: string
  ): Promise<{ lessonText: string; question: string }> {
    const apiKeys = this.getApiKeys();
    const defaultRes = {
      lessonText: `Assalomu alaykum, ${studentName}! Bugun siz bilan <b>${topic.title}</b> darsini o'rganamiz.\n\n` +
        `📖 <b>Mavzu mazmuni:</b>\n${topic.summary}\n\n` +
        `📌 <b>Qoidalar:</b>\n${topic.rules}\n\n` +
        `Ushbu qoidalarni diqqat bilan o'qib chiqing va tushunib oling.`,
      question: `Ushbu mavzuni qanday tushunganingizni bilish uchun savol: ${topic.title} darsining asosiy qoidasini qisqacha tushuntirib bering.`
    };

    if (apiKeys.length === 0) return defaultRes;

    const bookContentPart = bookExcerpt && bookExcerpt.trim()
      ? `\nKitobdagi aynan shu darsga oid matn:\n"""${bookExcerpt.slice(0, 5000)}"""\n`
      : '';

    const prompt = `Siz "AI Ustoz"siz. Nom: faqat "AI Ustoz". Hech qachon Gemini yoki o'zingizni AI texnologiyasi deb aytmang.
Kitob nomi yoki muallifi o'quvchiga MUTLAQO SIR!
O'quvchi ismi: ${studentName}.
Siz bugun o'quvchiga guruh darsligining ${topic.number}-mavzusini 1-darsdan boshlab samimiy va iliq o'rgatishingiz kerak.
Mavzu nomi: "${topic.title}".
${bookContentPart}

ENG QAT'IY TALABLAR (BUZISH QAT'IYAN TAQIQLANADI):
1. FAQAT BERILGAN DARSLIK MATNIDAGI MA'LUMOTDAN FOYDALANING:
   - Darslikdagi yangi arabcha so'zlarni va ularning ma'nolarini (lug'atini) o'quvchiga chiroyli, tushunarli qilib o'rgating.
   - Darsdagi qisqa iboralar va gaplarni (masalan: Bu kitob, Qalam qayerda?) tushuntiring.
   - Matnda bo'lmagan HECH QANDAY qoida, mavhum atama (harakat, e'rob, maxraj) yoki darsdan tashqari narsalarni qo'shmang!
2. Ohang: Haqiqiy, iliq, mehribon, samimiy jonli ustoz ohangida gapiring.
3. Dars yakunida o'quvchiga darslikdagi so'zlar yoki mashqlardan FAQAT 1 TA AMALIY SAVOL bering:
   - Masalan: "«...» so'zining ma'nosi nima?" yoki "«...» jumlasini arab tiliga tarjima qiling".
   - Quruq qoida yoki harakatlar haqida savol bermang!

Javobni FAQAT toza JSON formatida quyidagicha qaytaring:
{
  "lessonText": "AI Ustozning samimiy dars tushuntirishi (HTML teglari <b>, <i>, harakatli arabcha so'zlar bilan)",
  "question": "Mavzu bo'yicha beriladigan 1 ta amaliy tekshiruv savoli"
}`;

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
          const parsed = JSON.parse(text);
          if (parsed.lessonText && parsed.question) {
            return {
              lessonText: parsed.lessonText.trim(),
              question: parsed.question.trim(),
            };
          }
        }
      } catch (err) {
        console.warn('⚠️ [teachTopicLesson error]:', err);
      }
    }

    return defaultRes;
  }

  /**
   * AI Ustoz — O'quvchi bergan javobni tekshirish va mulohaza (feedback) berish
   */
  public static async evaluateStudentAnswer(
    topicTitle: string,
    question: string,
    userAnswer: string,
    isReview: boolean = false,
    lang: string = 'uz'
  ): Promise<{ isPassed: boolean; feedback: string }> {
    const apiKeys = this.getApiKeys();
    if (apiKeys.length === 0) {
      const isOk = userAnswer.trim().length >= 4;
      return {
        isPassed: isOk,
        feedback: isOk
          ? "Barakalla! Javobingiz to'g'ri qabul qilindi."
          : "Javobingiz yetarli emas, iltimos mavzuni qayta ko'rib chiqing."
      };
    }

    const prompt = `Siz adolatli, lekin mehribon va qo'llab-quvvatlovchi Arab tili ustozisiz.
Mavzu: "${topicTitle}".
Berilgan savol: "${question}".
O'quvchining javobi: "${userAnswer}".
Savol turi: ${isReview ? "Oldingi o'tilgan mavzuni mustahkamlash/nazorat savoli" : "Joriy mavzu tekshiruvi"}.

Vazifangiz:
1. O'quvchining javobi mazmunan to'g'rimi yoki xatomi/o'tolmadimi? (isPassed: true / false).
2. O'quvchiga iliq, samimiy ustozona izoh (feedback) yozing. To'g'ri bo'lsa maqtang, xato bo'lsa qayerda adashganini tushuntiring.

Javobni FAQAT toza JSON ko'rinishida qaytaring:
{
  "isPassed": true,
  "feedback": "Iliq ustozona javob matni"
}`;

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
          const parsed = JSON.parse(text);
          return {
            isPassed: Boolean(parsed.isPassed),
            feedback: String(parsed.feedback || '').trim(),
          };
        }
      } catch (err) {
        console.warn('⚠️ [evaluateStudentAnswer error]:', err);
      }
    }

    const isOk = userAnswer.trim().length >= 4;
    return {
      isPassed: isOk,
      feedback: isOk
        ? "Barakalla, javobingiz to'g'ri!"
        : "Javobingiz to'liq emas, mavzuni qayta takrorlash tavsiya etiladi."
    };
  }

  /**
   * AI Ustoz — O'tilgan oldingi mavzudan jiddiy mustahkamlash savolini tuzish
   */
  public static async generateReviewQuestion(
    previousTopic: { number: number; title: string; summary: string; rules: string },
    lang: string = 'uz'
  ): Promise<{ question: string }> {
    const apiKeys = this.getApiKeys();
    const defaultQ = `Eslatma savol (${previousTopic.title}): Ushbu mavzudagi asosiy qoidani misol bilan yozib bering.`;
    if (apiKeys.length === 0) return { question: defaultQ };

    const prompt = `Siz arab tili ustozisiz.
O'quvchi ilgari o'tgan mavzuni mustahkamlash va jiddiy nazorat qilish uchun ${previousTopic.number}-mavzu ("${previousTopic.title}") bo'yicha 1 ta JIDDIY, o'ylantiradigan nazorat savolini tuzing.
Mavzu mazmuni: "${previousTopic.summary}". Qoidalar: "${previousTopic.rules}".
Kitob nomini aslo aytmang.

Javobni FAQAT toza JSON ko'rinishida qaytaring:
{
  "question": "Savol matni"
}`;

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
          const parsed = JSON.parse(text);
          if (parsed.question) return { question: String(parsed.question).trim() };
        }
      } catch (err) {
        console.warn('⚠️ [generateReviewQuestion error]:', err);
      }
    }

    return { question: defaultQ };
  }

  /**
   * "Arab tili testi" bo'limi — Qattiq, kitob/mavzu asosida murakkab savollar tuzish
   * Mantiqiy qoida: Agar mavzu so'zning o'qilishi bo'lsa, o'sha so'zning o'ziga oid nozik detallari chuqurlashtiriladi.
   * Mavzuda yo'q begona grammatik tushunchalar qo'shilmaydi!
   */
  public static async generateHardTestQuestions(options: {
    bookText?: string;
    topicsRange?: string;
    questionTypes?: string[];
    count?: number;
    excludedQuestions?: string[];
    lang?: string;
  }): Promise<QuizQuestion[]> {
    const apiKeys = this.getApiKeys();
    const count = options.count || 5;
    const lang = options.lang || 'uz';

    if (apiKeys.length === 0) {
      return this.getFilteredFallbackQuestions(lang, options.excludedQuestions).slice(0, count);
    }

    const typesStr = (options.questionTypes && options.questionTypes.length > 0)
      ? options.questionTypes.join(', ')
      : "so'zlarning o'qilishi, grammatik qoidalar, matn tahlili";

    const topicsStr = options.topicsRange && options.topicsRange !== 'all'
      ? `Belgilangan mavzular: ${options.topicsRange}`
      : "Barcha asosiy o'quv mavzulari";

    const excerpt = (options.bookText || '').slice(0, 12000);

    let excludedPrompt = '';
    if (options.excludedQuestions && options.excludedQuestions.length > 0) {
      excludedPrompt = `\n⚠️ SAVOLLAR TAKRORLANMASIN (QAT'IY):\nO'quvchi ilgari to'g'ri yechgan quyidagi savollarni (yoki ularning ma'nodosh nusxasini) MUTLAQO QAYTA BERMANG:\n` +
        options.excludedQuestions.slice(0, 30).map((q, i) => `${i + 1}. "${q}"`).join('\n') + `\nMutlaqo yangi savollar tuzing!`;
    }

    const prompt = `Siz malakali Arab tili imtihonchisisiz.
Quyida guruh darsligidagi o'quvchi o'rgangan darslar matni, lug'atlari va mashqlari berilgan:
${topicsStr}
Kitob matnidan parcha:
"""
${excerpt || '(Darslik matni va lug\'atlari)'}
"""
${excludedPrompt}

ENG QAT'IY TALABLAR (BUZISH QAT'IYAN TAQIQLANADI):
1. Savollar FAQAT va FAQAT yuqoridagi darslik matnida mavjud bo'lgan so'zlar, mashqlar va jumlalardan tuzilsin!
2. SAVOL TURLARI FAQAT AMALIY BO'LSIN:
   - Darslikdagi so'zlar tarjimasi: "«...» so'zining to'g'ri tarjimasi nima?", "«...» so'zi arab tilida qanday bo'ladi?"
   - Kitob ichidagi mashqlar va gaplar tarjimasi: "«...» jumlasining to'g'ri tarjimasini toping."
   - Darslikdagi jumlalarni to'ldirish yoki ma'nosini topish.
3. MUTLAQO TAQIQLANADI:
   - "Buning harakati qanday?", "Qaysi qoida?", "E'robi nima?", maxraj yoki mavhum grammatik nazariyalar haqida savol tuzish MUTLAQO TAQIQLANADI!
   - Faqat va faqat darslikdagi so'zlar boyligi va matn tarjimalari bo'lsin!
4. Har bir savolda AYNAN 4 TA unikal variant bo'lsin. Noto'g'ri variantlar ham darslikdagi boshqa so'zlardan olingan bo'lsin.
5. Har bir savolga to'liq, tushunarli "explanation" (to'g'ri javob tarjimasi va izohi) yozing.
6. "correctIndex" 0, 1, 2 yoki 3 bo'lsin.

Javobni FAQAT toza JSON massiv formatida qaytaring:
[
  {
    "question": "«...» so'zining to'g'ri tarjimasi qaysi?",
    "options": ["Variant 1", "Variant 2", "Variant 3", "Variant 4"],
    "correctIndex": 0,
    "explanation": "To'liq tushuntirish va tarjima",
    "topic": "So'zlar va mashqlar"
  }
]`;

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const list: QuizQuestion[] = [];
            for (const item of parsed) {
              const clean = sanitizeQuizQuestion(item);
              if (clean) list.push(clean);
            }
            if (list.length >= 2) {
              return list.slice(0, count);
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ [generateHardTestQuestions error]:', err);
      }
    }

    return this.getFilteredFallbackQuestions(lang, options.excludedQuestions).slice(0, count);
  }



  /**
   * Yangi til qo'shilganda barcha matnlar va tugmalarni avtomatik tarjima qilish
   */
  public static async translateContentForNewLanguage(
    targetLangCode: string,
    targetLangName: string
  ): Promise<boolean> {
    const apiKeys = this.getApiKeys();
    if (apiKeys.length === 0) {
      console.log(`[Gemini] API kalit yo'q, yangi til (${targetLangName}) tarjimasi kutilmoqda holatida qoldi.`);
      return false;
    }

    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenerativeAI(key);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

        const menuRes = await db.query('SELECT id, key, title_uz FROM menu_buttons');
        const buttons = menuRes.rows;
        const sysRes = await db.query('SELECT id, key, text_uz FROM system_translations');
        const sysTexts = sysRes.rows;

        const payload = {
          menu: buttons.map(b => ({ id: b.id, key: b.key, text: b.title_uz })),
          system: sysTexts.map(s => ({ id: s.id, key: s.key, text: s.text_uz })),
        };

        const prompt = `Quyidagi O'zbek tilidagi matnlarni "${targetLangName}" tiliga aniq, madaniy va ta'lim sohasiga mos ravishda tarjima qiling.
Matn tarkibidagi emojilar va formatlashni (masalan 📊, 💳, **, \\n) saqlab qoling.
Faqat toza JSON formatida javob qaytaring:
${JSON.stringify(payload, null, 2)}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const translatedData = JSON.parse(cleanJson);

        if (translatedData.menu && Array.isArray(translatedData.menu)) {
          for (const item of translatedData.menu) {
            const current = await db.query('SELECT translations FROM menu_buttons WHERE id = $1', [item.id]);
            let transObj: Record<string, string> = {};
            try {
              if (current.rows[0]?.translations) {
                transObj = typeof current.rows[0].translations === 'string'
                  ? JSON.parse(current.rows[0].translations)
                  : current.rows[0].translations;
              }
            } catch {}
            transObj[targetLangCode] = item.text;
            await db.query(
              'UPDATE menu_buttons SET translations = $1 WHERE id = $2',
              [JSON.stringify(transObj), item.id]
            );
          }
        }

        if (translatedData.system && Array.isArray(translatedData.system)) {
          for (const item of translatedData.system) {
            const current = await db.query('SELECT translations FROM system_translations WHERE id = $1', [item.id]);
            let transObj: Record<string, string> = {};
            try {
              if (current.rows[0]?.translations) {
                transObj = typeof current.rows[0].translations === 'string'
                  ? JSON.parse(current.rows[0].translations)
                  : current.rows[0].translations;
              }
            } catch {}
            transObj[targetLangCode] = item.text;
            await db.query(
              'UPDATE system_translations SET translations = $1 WHERE id = $2',
              [JSON.stringify(transObj), item.id]
            );
          }
        }

        console.log(`✅ [Gemini] "${targetLangName}" (${targetLangCode}) tili muvaffaqiyatli tarjima qilindi!`);
        return true;
      } catch (err) {
        console.warn(`⚠️ [Gemini] Kalit bilan tarjimada xatolik, keyingi kalit tekshiriladi:`, err);
      }
    }

    return false;
  }

  /**
   * Zaxira savollarni avval to'g'ri yechilgan savollardan tozalab berish
   */
  public static getFilteredFallbackQuestions(lang: string, excludedQuestions?: string[]): QuizQuestion[] {
    const list = this.getFallbackQuestions(lang);
    if (!excludedQuestions || excludedQuestions.length === 0) {
      return list;
    }
    const filtered = list.filter(
      (q) => !excludedQuestions.some((ex) => ex.trim().toLowerCase() === q.question.trim().toLowerCase())
    );
    return filtered.length >= 3 ? filtered : list;
  }

  /**
   * Zaxira sifatli arab tili test savollari (Gemini mavjud bo'lmaganda yoki xatolikda yiqilmasligi uchun)
   */
  private static getFallbackQuestions(lang: string): QuizQuestion[] {
    if (lang === 'ru') {
      return [
        {
          question: "Сколько букв в арабском алфавите?",
          options: ["26", "28", "30", "32"],
          correctIndex: 1,
          explanation: "В арабском алфавите 28 букв, и все они согласные (за исключением алифа).",
          topic: "Алфавит"
        },
        {
          question: "В каком направлении пишется арабский текст?",
          options: ["Слева направо", "Справа налево", "Сверху вниз", "Любое направление"],
          correctIndex: 1,
          explanation: "Арабский язык пишется справа налево.",
          topic: "Письмо"
        },
        {
          question: "Что означает огласовка 'Фатха' (َ ) над буквой?",
          options: ["Звук [и]", "Звук [у]", "Звук [а]", "Отсутствие гласного (сукун)"],
          correctIndex: 2,
          explanation: "Фатха обозначает краткий гласный звук [а].",
          topic: "Огласовки"
        },
        {
          question: "Как переводится слово 'كِتَابٌ' (китаабун)?",
          options: ["Ручка", "Тетрадь", "Книга", "Школа"],
          correctIndex: 2,
          explanation: "'Китаб' в переводе с арабского означает 'Книга'.",
          topic: "Словарь"
        },
        {
          question: "Какой падеж обозначает огласовка 'Дамма' (ُ ) в конце слова?",
          options: ["Именительный (Марфу')", "Винительный (Мансуб)", "Родительный (Маджрур)", "Звательный"],
          correctIndex: 0,
          explanation: "Дамма указывает на именительный падеж (Марфу').",
          topic: "Грамматика"
        }
      ];
    }

    if (lang === 'en') {
      return [
        {
          question: "How many letters are in the Arabic alphabet?",
          options: ["26", "28", "30", "32"],
          correctIndex: 1,
          explanation: "There are 28 letters in the Arabic alphabet.",
          topic: "Alphabet"
        },
        {
          question: "In which direction is Arabic written?",
          options: ["Left to right", "Right to left", "Top to bottom", "Any direction"],
          correctIndex: 1,
          explanation: "Arabic is written from right to left.",
          topic: "Writing"
        },
        {
          question: "What sound does the 'Fathah' vowel mark represent?",
          options: ["Short [i]", "Short [u]", "Short [a]", "Absence of vowel"],
          correctIndex: 2,
          explanation: "Fathah produces a short [a] sound.",
          topic: "Vowels"
        },
        {
          question: "What is the meaning of the word 'كِتَابٌ' (Kitab)?",
          options: ["Pen", "Notebook", "Book", "School"],
          correctIndex: 2,
          explanation: "'Kitab' means 'Book' in Arabic.",
          topic: "Vocabulary"
        },
        {
          question: "Which branch of Arabic grammar deals with sentence structure?",
          options: ["Sarf", "Nahw", "Balagha", "Tajweed"],
          correctIndex: 1,
          explanation: "Nahw (syntax) studies sentence structure and case endings.",
          topic: "Grammar"
        }
      ];
    }

    // Default: O'zbek tili
    return [
      {
        question: "«كِتَابٌ» (Kitaabun) so'zining to'g'ri tarjimasi qaysi?",
        options: ["Qalam", "Daftar", "Kitob", "Chizg'ich"],
        correctIndex: 2,
        explanation: "«كِتَابٌ» arabchadan tarjima qilinganda «Kitob» degan ma'noni bildiradi.",
        topic: "1-dars lug'ati"
      },
      {
        question: "«قَلَمٌ» (Qalamun) so'zining o'zbekcha ma'nosi nima?",
        options: ["Qalam", "Doska", "Siyohdon", "Qog'oz"],
        correctIndex: 0,
        explanation: "«قَلَمٌ» so'zi «Qalam» deb tarjima qilinadi.",
        topic: "1-dars lug'ati"
      },
      {
        question: "«دَفْتَرٌ» (Daftarun) so'zi qanday tarjima qilinadi?",
        options: ["Kitob", "Daftar", "Parta", "Sinf"],
        correctIndex: 1,
        explanation: "«دَفْتَرٌ» arab tilida «Daftar» degani.",
        topic: "1-dars lug'ati"
      },
      {
        question: "«مِسْطَرَةٌ» (Mistarotun) so'zining tarjimasi qaysi?",
        options: ["Qog'oz", "Siyohdon", "Chizg'ich", "Doska"],
        correctIndex: 2,
        explanation: "«مِسْطَرَةٌ» so'zi «Chizg'ich» ma'nosini anglatadi.",
        topic: "1-dars lug'ati"
      },
      {
        question: "«أَيْنَ الْقَلَمُ؟» jumlasining to'g'ri tarjimasi nima?",
        options: ["Bu qalam", "Qalam qayerda?", "Qalamni ber", "Qalamni ol"],
        correctIndex: 1,
        explanation: "«أَيْنَ» — qayerda?, «الْقَلَمُ» — qalam. Jumla: «Qalam qayerda?» degani.",
        topic: "1-dars mashqlari"
      }
    ];
  }
}

