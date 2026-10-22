import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

export interface BookTopic {
  number: number;
  title: string;
  summary: string;
  rules: string;
}

export class PdfBookService {
  /**
   * PDF fayldan matn ajratib olish
   */
  public static async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      let resolvedPath = filePath;
      if (!fs.existsSync(resolvedPath)) {
        const cleanRel = filePath.replace(/^[/\\]+/, '');
        resolvedPath = path.resolve(process.cwd(), cleanRel);
      }
      if (!fs.existsSync(resolvedPath)) {
        console.warn('⚠️ [PDF Parse]: File not found:', filePath, '->', resolvedPath);
        return '';
      }
      const dataBuffer = fs.readFileSync(resolvedPath);
      const pdfParseModule = await import('pdf-parse');
      // v2 API: { PDFParse }
      if ((pdfParseModule as any).PDFParse) {
        const PDFParseClass = (pdfParseModule as any).PDFParse;
        const parser = new PDFParseClass({ data: dataBuffer });
        const res = await parser.getText();
        return (res?.text || '').trim();
      }
      // v1 fallback
      const pdf = (pdfParseModule as any).default || pdfParseModule;
      if (typeof pdf === 'function') {
        const parsed = await pdf(dataBuffer);
        return (parsed.text || '').trim();
      }
      return '';
    } catch (err) {
      console.warn('⚠️ [PDF Parse Error]:', err);
      return '';
    }
  }

  /**
   * Kitob matnidan ketma-ket dars mavzularini (1-mavzu, 2-mavzu...) ajratish
   */
  public static async generateTopicsFromBook(
    bookName: string,
    bookText?: string
  ): Promise<BookTopic[]> {
    // Agar kitob matni mavjud bo'lsa va Gemini API kaliti bo'lsa, mavzular rejasini tuzamiz
    const apiKey = (config.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    if (apiKey) {
      try {
        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

        const excerpt = (bookText || '').slice(0, 15000);
        const prompt = `Siz malakali arab tili metodistisiz.
Quyidagi arab tili darsligi asosida ketma-ket 1-mavzudan boshlab 10-15 ta asosiy dars mavzulari rejasini tuzing.
Har bir mavzu aniq ketma-ketlikda (1, 2, 3...) bo'lsin.

Kitob nomi: "${bookName}"
Kitob matnidan namuna:
${excerpt || '(Standart arab tili darsligi dasturi)'}

Javobni FAQAT toza JSON formatida quyidagicha qaytaring:
[
  {
    "number": 1,
    "title": "1-mavzu nomi (masalan: Arab alifbosi va harflar)",
    "summary": "Mavzuning qisqacha mazmuni",
    "rules": "Asosiy qoidalar va o'rganiladigan tushunchalar"
  }
]`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          text = text.slice(start, end + 1);
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            return parsed.map((item, idx) => ({
              number: Number(item.number) || idx + 1,
              title: String(item.title || `${idx + 1}-dars`).trim(),
              summary: String(item.summary || '').trim(),
              rules: String(item.rules || '').trim(),
            }));
          }
        }
      } catch (e) {
        console.warn('⚠️ [Generate Topics Error]:', e);
      }
    }

    // Zaxira standart darslik mavzulari (Mabda ul-Qiroat / Durusul Lugha tizimi)
    return this.getDefaultTopics(bookName);
  }

  public static getDefaultTopics(bookName?: string): BookTopic[] {
    return [
      {
        number: 1,
        title: "1-dars: Dastlabki so'zlar va buyumlar",
        summary: "Kitob, qalam, daftar, chizg'ich, doska, qog'oz kabi asosiy so'zlar va ularning ma'nolari.",
        rules: "Asosiy buyum nomlari, «Bu nima?» (ما هذا) va «Qayerda?» (أين) so'roqlari."
      },
      {
        number: 2,
        title: "2-dars: Ko'rsatish olmoshlari va so'z boyligi",
        summary: "Yaqin va uzoq buyumlarni ko'rsatish, darslikdagi yangi so'zlar va matnlar.",
        rules: "Haza (هذا) va Zalika (ذلك) bilan sodda birikmalar tuzish."
      },
      {
        number: 3,
        title: "3-dars: Maktab va sinf buyumlari",
        summary: "Sinfdagi jihozlar, ularning o'rni va darslikdagi mashqlar.",
        rules: "Buyumlarning joylashuvi va ularni ifodalash."
      },
      {
        number: 4,
        title: "4-dars: Uy va oila a'zolari",
        summary: "Uy buyumlari, sodda kundalik so'zlar va tarjimalar.",
        rules: "Ismlarning birikmalari va sodda gaplar."
      },
      {
        number: 5,
        title: "5-dars: Sifatlar va tavsiflar",
        summary: "Katta, kichik, yangi, eski kabi sifatlar va ularning qo'llanilishi.",
        rules: "Sifat va ot moslashuvi."
      }
    ];
  }

  /**
   * Kitob matnidan aynan berilgan dars raqami (masalan 1-dars) matnini ajratib olish
   */
  public static extractLessonText(bookText?: string, lessonNumber: number = 1): string {
    if (!bookText || !bookText.trim()) return '';

    const text = bookText;
    const lessonRegex = /الدَّرْس[\s\S]{1,25}?(?=\n|$)/g;
    const matches: Array<{ index: number; title: string }> = [];
    let m;
    while ((m = lessonRegex.exec(text)) !== null) {
      matches.push({ index: m.index, title: m[0].trim().replace(/\s+/g, ' ') });
    }

    if (matches.length > 0) {
      const idx = Math.max(0, Math.min(lessonNumber - 1, matches.length - 1));
      const start = matches[idx].index;
      const end = matches[idx + 1] ? matches[idx + 1].index : Math.min(text.length, start + 3500);
      return text.slice(start, end).trim();
    }

    const chunkSize = 3000;
    const start = Math.max(0, (lessonNumber - 1) * chunkSize);
    return text.slice(start, start + chunkSize).trim();
  }

  /**
   * 1-darsdan to maxLesson darsigacha bo'lgan barcha matn va lug'atlarni olish (test tuzish uchun)
   */
  public static extractLessonsUpTo(bookText?: string, maxLesson: number = 1): string {
    if (!bookText || !bookText.trim()) return '';

    const text = bookText;
    const lessonRegex = /الدَّرْس[\s\S]{1,25}?(?=\n|$)/g;
    const matches: Array<{ index: number; title: string }> = [];
    let m;
    while ((m = lessonRegex.exec(text)) !== null) {
      matches.push({ index: m.index, title: m[0].trim().replace(/\s+/g, ' ') });
    }

    if (matches.length > 0) {
      const start = matches[0].index;
      const endIdx = Math.min(maxLesson, matches.length);
      const end = matches[endIdx] ? matches[endIdx].index : text.length;
      return text.slice(start, Math.min(start + 18000, end)).trim();
    }

    return text.slice(0, Math.min(text.length, maxLesson * 3000));
  }
}
