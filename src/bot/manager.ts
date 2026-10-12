import { Bot, Context } from 'grammy';
import { db, getTashkentDate } from '../db/index.js';
import { config } from '../config.js';
import { I18nService } from './i18n.js';
import { BotKeyboards } from './keyboards.js';
import { UserSessionState } from './types.js';
import { GeminiService, QuizQuestion } from '../services/gemini.js';
import { PdfBookService } from '../services/pdfBook.js';

export class BotManager {
  private static instance: BotManager;
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private currentToken: string = '';
  private sessions = new Map<number, UserSessionState>();

  private constructor() {}

  public static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }

  public getSession(telegramId: number): UserSessionState {
    if (!this.sessions.has(telegramId)) {
      this.sessions.set(telegramId, { state: 'idle' });
    }
    return this.sessions.get(telegramId)!;
  }

  public clearSession(telegramId: number): void {
    const s = this.getSession(telegramId);
    this.sessions.set(telegramId, { state: 'idle', isAdmin: s.isAdmin });
  }

  /**
   * Admin bilan to'g'ridan-to'g'ri Telegram shaxsiy chatiga o'tish havolasi
   * Faqat bitta ADMIN_ID ishlatiladi!
   */
  public getAdminTelegramUrl(prefilledText?: string): string {
    const adminId = (config.adminId || '8145529224').trim().replace(/^@/, '');

    // Agar raqam bo'lsa (masalan 8145529224) - Telegram chatini to'g'ridan-to'g'ri ochadi
    if (/^\d+$/.test(adminId)) {
      return `tg://user?id=${adminId}`;
    }

    if (prefilledText) {
      return `https://t.me/${adminId}?text=${encodeURIComponent(prefilledText)}`;
    }
    return `https://t.me/${adminId}`;
  }

  public async getStatus(): Promise<{ isRunning: boolean; hasToken: boolean; botUsername?: string }> {
    const hasToken = Boolean(config.botToken && config.botToken.trim().length > 0);
    let botUsername: string | undefined;

    if (this.bot && this.isRunning) {
      try {
        const me = await this.bot.api.getMe();
        botUsername = me.username;
      } catch {}
    }

    return {
      isRunning: this.isRunning,
      hasToken,
      botUsername,
    };
  }

  /**
   * Botni ishga tushirish (Faqat 1 ta BOT_TOKEN bilan ishlaydi)
   */
  public async start(): Promise<void> {
    const activeToken = (config.botToken || '').trim();

    if (!activeToken) {
      console.error('❌ [Telegram Bot] Bot tokeni (.env dagi BOT_TOKEN) topilmadi.');
      this.isRunning = false;
      return;
    }

    if (this.isRunning && this.currentToken === activeToken) {
      console.log(`ℹ️ [Telegram Bot] Bot allaqachon ushbu token bilan ishlamoqda.`);
      return;
    }

    if (this.isRunning) {
      await this.stop();
    }

    try {
      console.log('🔍 [Telegram Bot] Bot tokeni tekshirilmoqda...');
      const testBot = new Bot(activeToken);
      const me = await testBot.api.getMe();
      console.log(`✅ [Telegram Bot] Bot yaroqli: @${me.username}`);

      this.currentToken = activeToken;
      this.bot = new Bot(activeToken);
      this.setupHandlers(this.bot);

      // Webhookni tozalash
      await this.bot.api.deleteWebhook({ drop_pending_updates: true }).catch((err) => {
        console.warn('⚠️ [Telegram Bot] Webhook tozalashda ogohlantirish:', err.message);
      });

      // Buyruqlarni o'rnatish: Faqat /start
      await this.bot.api.setMyCommands([
        { command: 'start', description: "Botni qayta ishga tushirish" },
      ]).catch(() => {});

      await this.bot.api.setChatMenuButton({
        menu_button: { type: 'default' },
      }).catch(() => {});

      this.bot
        .start({
          onStart: (info) => {
            this.isRunning = true;
            console.log(`🚀 [Telegram Bot] @${info.username} muvaffaqiyatli ishga tushdi!`);
          },
        })
        .catch((err) => {
          this.isRunning = false;
          console.warn(`⚠️ [Telegram Bot] Polling xatosi:`, err?.message || err);
        });
    } catch (err: any) {
      this.isRunning = false;
      console.error('❌ [Telegram Bot] Botni ishga tushirishda xatolik:', err?.message || err);
    }
  }

  public async restart(): Promise<void> {
    console.log('🔄 [Telegram Bot] Bot qayta yuklanmoqda...');
    await this.stop();
    await this.start();
  }

  public async stop(): Promise<void> {
    if (this.bot && this.isRunning) {
      try {
        await this.bot.stop();
        console.log('🛑 [Telegram Bot] Bot to\'xtatildi.');
      } catch (err) {
        console.warn('⚠️ [Telegram Bot] To\'xtatishda xato:', err);
      } finally {
        this.isRunning = false;
        this.bot = null;
      }
    }
  }

  public async sendToUser(telegramId: number | string, message: string): Promise<boolean> {
    if (!this.bot || !this.isRunning) return false;
    try {
      await this.bot.api.sendMessage(Number(telegramId), message, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      console.error(`[Telegram Bot] Send message to ${telegramId} failed:`, err);
      return false;
    }
  }

  public isUserAdmin(telegramId: number, session?: UserSessionState): boolean {
    if (session?.isAdmin) return true;
    const strId = String(telegramId);
    return strId === config.adminId;
  }

  private setupHandlers(bot: Bot): void {
    bot.catch(async (err) => {
      console.error('[Telegram Bot Error]:', err.error);
      const ctx = err.ctx;
      if (ctx && ctx.chat) {
        const telegramId = ctx.from?.id;
        const session = telegramId ? this.getSession(telegramId) : undefined;
        if (session && session.state === 'taking_test') {
          try {
            const lang = telegramId ? await I18nService.getUserLanguage(telegramId) : 'uz';
            await this.finishQuiz(ctx, telegramId!, session, lang);
          } catch (finishErr) {
            console.error('Error in finishQuiz inside bot.catch:', finishErr);
          }
          return;
        }
        // Talab 1: "Kechirasiz, vaqtincha nosozlik yuz berdi..." umumiy xato xabari foydalanuvchiga chiqmasin
      }
    });

    // 1. /start buyrug'i
    bot.command('start', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const firstName = ctx.from?.first_name || '';
      const username = ctx.from?.username || '';

      const userRes = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
      if (userRes.rows.length === 0) {
        await db.query(
          `INSERT INTO users (telegram_id, username, first_name, language_code, status, is_paid)
           VALUES ($1, $2, $3, 'uz', 'active', FALSE)`,
          [telegramId, username, firstName]
        );
      } else {
        await db.query(
          `UPDATE users SET last_active = CURRENT_TIMESTAMP, first_name = $1, username = $2 WHERE telegram_id = $3`,
          [firstName, username, telegramId]
        );
      }

      this.clearSession(telegramId);

      const langKeyboard = await BotKeyboards.getLanguageKeyboard();
      await ctx.reply(
        "Assalomu alaykum! Iltimos, tilni tanlang:\n\nПожалуйста, выберите язык:\n\nPlease choose your language:",
        { reply_markup: langKeyboard }
      );
    });

    // 2. /admin buyrug'i (Parol so'raydi, so'ngra qulay boshqaruv panelini ochadi)
    bot.command('admin', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      await this.handleAdminCommand(ctx, telegramId);
    });

    // 3. Til tanlash callback
    bot.callbackQuery(/^set_lang:(.+)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const langCode = ctx.match[1];

      await I18nService.setUserLanguage(telegramId, langCode);
      await ctx.answerCallbackQuery({ text: '✅ Saqlandi' });

      let infoText = '';
      if (langCode === 'ru') {
        infoText =
          `🌟 <b>Добро пожаловать в онлайн школу арабского языка!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📗 <b>A1 Начальный уровень</b>\n` +
          `Алфавит, звуки, махраджи, правила чтения и письма. За первый месяц вы выучите более 150 слов с грамматикой.\n\n` +
          `📘 <b>A2 Средний уровень</b>\n` +
          `Простые конструкции предложений, разговорная речь, базовая грамматика.\n\n` +
          `📙 <b>B1 – B2 Продвинутый уровень</b>\n` +
          `Сарф, нахв, свободная речь, академические тексты и практическое общение.\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✍️ Чтобы записаться на курс, нажмите кнопку ниже:`;
      } else if (langCode === 'en') {
        infoText =
          `🌟 <b>Welcome to Arabic Language Learning Platform!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📗 <b>A1 Beginner Level</b>\n` +
          `Alphabet, phonetics, reading and writing rules. Learn 150+ essential vocabulary words in the first month.\n\n` +
          `📘 <b>A2 Intermediate</b>\n` +
          `Everyday communication, sentences, grammar, and listening comprehension.\n\n` +
          `📙 <b>B1 – B2 Advanced</b>\n` +
          `Sarf, Nahw, fluent speech, and Quranic Arabic analysis.\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✍️ To enroll in a course, click the button below:`;
      } else {
        infoText =
          `🌟 <b>Arab tili o'quv botiga xush kelibsiz!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📗 <b>A1 Boshlang'ich Daraja</b>\n` +
          `Alifbo, to'g'ri tovushlar va maxrajlar, o'qish-yozish qoidalari hamda 150+ asosiy so'z boyligi.\n\n` +
          `📘 <b>A2 O'rta Daraja</b>\n` +
          `Sodda gap tuzilmalari, kundalik muloqot, asosiy grammatika va mustaqil matn tushunish.\n\n` +
          `📙 <b>B1 – B2 Yuqori Daraja</b>\n` +
          `Sarf, nahv, ravon nutq, mumtoz va zamonaviy matnlar tahlili.\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✍️ Kursga yozilish yoki ma'lumot olish uchun quyidagi tugmani bosing:`;
      }

      const enrollKb = await BotKeyboards.getEnrollKeyboard(langCode);
      await ctx.reply(infoText, { parse_mode: 'HTML', reply_markup: enrollKb });

      const mainKb = await BotKeyboards.getMainMenu(langCode);
      const menuPrompt = langCode === 'ru' ? "Главное меню:" : langCode === 'en' ? "Main Menu:" : "Asosiy menyu:";
      await ctx.reply(menuPrompt, { reply_markup: mainKb });
    });

    // 4. "Kursga yozilish" callback
    bot.callbackQuery('action_enroll', async (ctx) => {
      const telegramId = ctx.from.id;
      const lang = await I18nService.getUserLanguage(telegramId);
      await ctx.answerCallbackQuery();
      await this.handlePaymentRequest(ctx, telegramId, lang);
    });

    // 5. Guruh tanlash callback (Kirish kodi so'rash)
    bot.callbackQuery(/^join_group:(\d+)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const groupId = parseInt(ctx.match[1], 10);
      const lang = await I18nService.getUserLanguage(telegramId);
      await ctx.answerCallbackQuery();

      const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
      if (groupRes.rows.length === 0) {
        await ctx.reply(lang === 'ru' ? "Группа не найдена." : "Guruh topilmadi.");
        return;
      }

      const session = this.getSession(telegramId);
      session.state = 'waiting_group_code';
      session.selectedGroupId = groupId;

      const askCodeText =
        lang === 'ru'
          ? "Пожалуйста, введите код доступа к группе:"
          : "Iltimos, guruhga kirish maxsus kodini kiriting:";

      await ctx.reply(`🔒 <b>${groupRes.rows[0].name}</b>\n━━━━━━━━━━━━━━━━━━━━\n${askCodeText}`, { parse_mode: 'HTML' });
    });

    // 6. Statistika: Bitta tugma bilan ochib-yopish callback (⬇️ / ⬆️)
    bot.callbackQuery(/^toggle_stats:(open|close)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const action = ctx.match[1]; // 'open' or 'close'
      const lang = await I18nService.getUserLanguage(telegramId);

      await ctx.answerCallbackQuery();
      await this.renderAllGroupsStatsCard(ctx, telegramId, lang, action === 'open', true);
    });

    // 7. Admin panel inline tugmalari
    bot.callbackQuery(/^admin_view:(stats|groups|students|tests|refresh)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const action = ctx.match[1];
      const session = this.getSession(telegramId);

      if (!this.isUserAdmin(telegramId, session)) {
        await ctx.answerCallbackQuery({ text: '⛔️ Sizda administrator huquqi yo\'q', show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery();
      const adminUrl = config.adminPanelUrl || `http://localhost:${config.adminPort}`;
      const kb = BotKeyboards.getAdminPanelKeyboard(adminUrl);

      if (action === 'stats' || action === 'refresh') {
        const uCount = await db.query('SELECT COUNT(*) as count FROM users');
        const gCount = await db.query('SELECT COUNT(*) as count FROM groups WHERE is_active = TRUE');
        const pCount = await db.query('SELECT COUNT(*) as count FROM users WHERE is_paid = TRUE');
        const tCount = await db.query('SELECT COUNT(*) as count FROM user_tests');
        const scoreRes = await db.query('SELECT COALESCE(SUM(grade), 0) as total_scores, ROUND(AVG(grade), 1) as avg FROM student_grades');

        const msg =
          `📊 <b>Tizim Statistikasi (Administrator)</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👥 Jami o'quvchilar: <b>${uCount.rows[0]?.count || 0} nafar</b>\n` +
          `💳 To'lagan o'quvchilar: <b>${pCount.rows[0]?.count || 0} nafar</b>\n` +
          `📚 Faol guruhlar: <b>${gCount.rows[0]?.count || 0} ta</b>\n` +
          `📝 Yechilgan testlar: <b>${tCount.rows[0]?.count || 0} ta</b>\n` +
          `⭐️ Umumiy jamlangan ballar: <b>${scoreRes.rows[0]?.total_scores || 0} ball</b> (O'rtacha: ${scoreRes.rows[0]?.avg || 0})\n\n` +
          `🌐 <b>Veb Panel:</b> <a href="${adminUrl}">Admin Panel Saytini Ochish</a>`;

        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
        return;
      }

      if (action === 'groups') {
        const grpRes = await db.query(
          `SELECT g.id, g.name, g.access_code,
            (SELECT COUNT(*) FROM users u WHERE u.joined_group_id = g.id) as members_count
           FROM groups g ORDER BY g.id ASC`
        );

        let gText = `👥 <b>Guruhlar Nazorati</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (grpRes.rows.length === 0) {
          gText += `<i>Hozircha guruhlar mavjud emas.</i>\n`;
        } else {
          grpRes.rows.forEach((g: any, i: number) => {
            gText += `${i + 1}. <b>${g.name}</b>\n` +
                     `   🔑 Kirish kodi: <code>${g.access_code}</code>\n` +
                     `   👥 O'quvchilar soni: <b>${g.members_count} nafar</b>\n\n`;
          });
        }
        await ctx.reply(gText, { parse_mode: 'HTML', reply_markup: kb });
        return;
      }

      if (action === 'students') {
        const today = getTashkentDate();
        const stdRes = await db.query(
          `SELECT u.first_name, u.username, g.name as group_name,
            COALESCE(SUM(sg.grade), 0) as total_score,
            MAX(CASE WHEN sg.grade_date = $1 THEN sg.grade ELSE NULL END) as today_grade
           FROM users u
           LEFT JOIN groups g ON g.id = u.joined_group_id
           LEFT JOIN student_grades sg ON sg.user_id = u.id
           GROUP BY u.id, u.first_name, u.username, g.name
           ORDER BY total_score DESC, u.id DESC LIMIT 15`,
          [today]
        );

        let sText = `🎓 <b>O'quvchilar va Jamlangan Ballar (Top-15)</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (stdRes.rows.length === 0) {
          sText += `<i>O'quvchilar ro'yxati bo'sh.</i>\n`;
        } else {
          stdRes.rows.forEach((s: any, i: number) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            const name = s.first_name || (s.username ? `@${s.username}` : `O'quvchi`);
            const grp = s.group_name || 'Guruhsiz';
            const todayStr = s.today_grade ? `(Bugun: ⭐️ ${s.today_grade})` : '';
            sText += `${medal} <b>${name}</b> [${grp}] — <b>${s.total_score} ball</b> ${todayStr}\n`;
          });
        }
        await ctx.reply(sText, { parse_mode: 'HTML', reply_markup: kb });
        return;
      }

      if (action === 'tests') {
        const testRes = await db.query(
          `SELECT level, COUNT(*) as count FROM user_tests GROUP BY level ORDER BY count DESC`
        );
        let tText = `📝 <b>Test Tizimi Natijalari</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (testRes.rows.length === 0) {
          tText += `<i>Testlar hali yechilmagan.</i>\n`;
        } else {
          testRes.rows.forEach((t: any) => {
            tText += `• <b>${t.level}:</b> ${t.count} ta topshirilgan\n`;
          });
        }
        await ctx.reply(tText, { parse_mode: 'HTML', reply_markup: kb });
        return;
      }
    });

    // 8. AI Ustoz rejimini yopish callback
    bot.callbackQuery(/^(exit_gemini|exit_ai_tutor)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      this.clearSession(telegramId);
      await ctx.answerCallbackQuery({ text: 'AI Ustoz rejimidan chiqildi' });
      const lang = await I18nService.getUserLanguage(telegramId);
      await ctx.reply("Asosiy menyuga qaytdingiz:", { reply_markup: await BotKeyboards.getMainMenu(lang) });
    });

    // 9. Test javoblari callback
    bot.callbackQuery(/^quiz_answer:(\d+)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const selectedIndex = parseInt(ctx.match[1], 10);
      const session = this.getSession(telegramId);
      const lang = await I18nService.getUserLanguage(telegramId);

      if (session.state !== 'taking_test' || !session.testQuestions) {
        await ctx.answerCallbackQuery();
        return;
      }

      const currentIdx = session.testCurrentIndex || 0;
      const question = session.testQuestions[currentIdx];

      const isCorrect = selectedIndex === question.correctIndex;
      if (isCorrect) {
        session.testScore = (session.testScore || 0) + 1;
        await ctx.answerCallbackQuery({ text: '✅ To\'g\'ri!' });
      } else {
        await ctx.answerCallbackQuery({ text: '❌ Noto\'g\'ri' });
      }

      const topicName = question.topic || 'Arab tili';
      const userAnswerText = question.options[selectedIndex] || '';
      const correctAnswerText = question.options[question.correctIndex] || '';

      // Sessiyadagi joriy test javoblari ro'yxatiga qo'shish
      session.testAttempts = session.testAttempts || [];
      session.testAttempts.push({
        question: question.question,
        topic: topicName,
        options: question.options,
        selectedIndex,
        correctIndex: question.correctIndex,
        isCorrect,
        userAnswerText,
        correctAnswerText,
        explanation: question.explanation || '',
      });

      // user_quiz_history jadvaliga saqlash (takrorlanmaslik va mustahkamlash uchun)
      try {
        await db.query(
          `INSERT INTO user_quiz_history 
           (telegram_id, question, topic, is_correct, user_answer, correct_answer, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            telegramId,
            question.question,
            topicName,
            isCorrect,
            userAnswerText,
            correctAnswerText,
            question.explanation || '',
          ]
        );
      } catch (dbErr) {
        console.warn('user_quiz_history insert error:', dbErr);
      }

      // Zaif mavzular statistikasi
      try {
        const topicCheck = await db.query(
          'SELECT id, correct_count, wrong_count FROM user_topic_stats WHERE telegram_id = $1 AND topic = $2',
          [telegramId, topicName]
        );
        if (topicCheck.rows.length > 0) {
          if (isCorrect) {
            await db.query(
              'UPDATE user_topic_stats SET correct_count = correct_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
              [topicCheck.rows[0].id]
            );
          } else {
            await db.query(
              'UPDATE user_topic_stats SET wrong_count = wrong_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
              [topicCheck.rows[0].id]
            );
          }
        } else {
          await db.query(
            'INSERT INTO user_topic_stats (telegram_id, topic, correct_count, wrong_count) VALUES ($1, $2, $3, $4)',
            [telegramId, topicName, isCorrect ? 1 : 0, isCorrect ? 0 : 1]
          );
        }
      } catch (e) {
        console.warn('user_topic_stats error:', e);
      }

      session.testCurrentIndex = currentIdx + 1;
      if (session.testCurrentIndex < session.testQuestions.length) {
        await this.sendNextQuizQuestion(ctx, telegramId, session, lang);
      } else {
        await this.finishQuiz(ctx, telegramId, session, lang);
      }
    });

    // 9.1. Test xatolarini bitta tugma bilan ochish / yopish callback (editMessageText orqali)
    bot.callbackQuery(/^toggle_quiz_review:(open|close)$/, async (ctx) => {
      const telegramId = ctx.from.id;
      const action = ctx.match[1];
      const session = this.getSession(telegramId);
      const lang = await I18nService.getUserLanguage(telegramId);

      await ctx.answerCallbackQuery();
      const isOpen = action === 'open';
      const text = this.renderQuizSummaryText(session, isOpen, lang);
      const kb = BotKeyboards.getQuizReviewKeyboard(isOpen, lang);

      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
      } catch (err) {
        console.warn('Quiz review toggle error:', err);
      }
    });


    // 10. Barcha matnli xabarlar
    bot.on('message:text', async (ctx) => {
      const telegramId = ctx.from.id;
      const text = ctx.message.text.trim();
      const session = this.getSession(telegramId);
      const lang = await I18nService.getUserLanguage(telegramId);

      // Agar admin parolini kutayotgan bo'lsa
      if (session.state === 'waiting_admin_password') {
        const settingRes = await db.query("SELECT value FROM settings WHERE key = 'admin_password'");
        const dbPassword = settingRes.rows[0]?.value;
        const correctPassword = (dbPassword !== undefined ? dbPassword : config.adminPassword || '123').trim();

        if (text === correctPassword) {
          session.isAdmin = true;
          session.state = 'idle';

          const adminUrl = config.adminPanelUrl || `http://localhost:${config.adminPort}`;
          await ctx.reply(adminUrl);
        } else {
          session.state = 'idle';
          await ctx.reply("⛔️ Parol noto'g'ri kiritildi!");
        }
        return;
      }

      // Agar guruh kodini kutayotgan bo'lsa
      if (session.state === 'waiting_group_code' && session.selectedGroupId) {
        await this.handleGroupCodeVerification(ctx, telegramId, text, session.selectedGroupId, lang);
        return;
      }

      const lower = text.toLowerCase();

      // 0. Admin panel menyu tugmasi yoki /admin
      if (text.includes('Admin Panel') || text.includes('Админ Панель') || lower === '/admin') {
        await this.handleAdminCommand(ctx, telegramId);
        return;
      }

      // 1. Statistika va Umumiy Reyting menyusi (Barcha guruhlar, bitta tugma orqali ochilib-yopiladi)
      if (lower.includes('statistika') || lower.includes('статистика') || lower.includes('statistic') || lower.includes('reyting') || lower.includes('рейтинг')) {
        await this.renderAllGroupsStatsCard(ctx, telegramId, lang, false, false);
        return;
      }

      // 2. Guruhlar menyusi
      if (lower.includes('o\'quv guruh') || lower.includes('oquv guruh') || lower.includes('учебные групп') || lower.includes('study group') || lower === "👥 o'quv guruhlari") {
        await this.handleGroupsList(ctx, telegramId, lang);
        return;
      }

      // 3. Test menyusi (Band 2: Kuniga bir marta, admindan tashqari hammaga)
      if (lower.includes('test') || lower.includes('тест') || lower.includes('quiz')) {
        const isAdmin = this.isUserAdmin(telegramId);
        if (!isAdmin) {
          const testSettingsRes = await db.query('SELECT * FROM test_settings LIMIT 1');
          const settings = testSettingsRes.rows[0];
          const dailyLimit = settings && settings.test_daily_limit !== null ? Number(settings.test_daily_limit) : 1;

          if (dailyLimit > 0) {
            const today = getTashkentDate();
            const checkAttempt = await db.query(
              'SELECT COUNT(*) as count FROM daily_test_attempts WHERE telegram_id = $1 AND test_date = $2',
              [telegramId, today]
            );
            const attemptCount = Number(checkAttempt.rows[0]?.count || 0);

            if (attemptCount >= dailyLimit) {
              await ctx.reply(
                `Siz bugungi test limitingizdan to'liq foydalandingiz.\n\n⏳ Sizning limitingiz 00:00 da ochiladi.`
              );
              return;
            }
          }
        }

        await this.startQuiz(ctx, telegramId, lang, true);
        return;
      }

      // 4. AI Ustoz menyusi (Band 3 & 4: Nom "AI Ustoz", kitob nomi sir, ketma-ket dars)
      if (lower.includes('ai ustoz') || lower.includes('ии учитель') || lower.includes('ai tutor') || lower.includes('ustoz') || lower.includes('gemini')) {
        await this.handleAITutorStart(ctx, telegramId, lang);
        return;
      }

      // 5. To'lov menyusi (Admin Telegram shaxsiy chatiga to'g'ridan-to'g'ri o'tish)
      if (lower.includes('to\'lov') || lower.includes("to'lov") || lower.includes('tolov') || lower.includes('оплат') || lower.includes('payment')) {
        await this.handlePaymentRequest(ctx, telegramId, lang);
        return;
      }

      // 6. Aloqa / Yordam menyusi (Admin Telegram shaxsiy chatiga to'g'ridan-to'g'ri o'tish)
      if (lower.includes('aloqa') || lower.includes('yordam') || lower.includes('admin bilan bog\'lanish') || lower.includes('связь') || lower.includes('поддержк') || lower.includes('contact')) {
        await this.handleSupportInfo(ctx, lang);
        return;
      }

      // 7. Agar foydalanuvchi AI Ustoz suhbat / dars rejimida bo'lsa
      if (session.state === 'chatting_with_ai_tutor' || session.state === 'chatting_with_gemini') {
        await this.handleAITutorUserMessage(ctx, telegramId, text, lang);
        return;
      }


      // Noma'lum xabar holatida menyuni chiqarish (Admin tugmasi yashirin)
      await ctx.reply(
        "Iltimos, quyidagi asosiy menyu tugmalaridan foydalaning:",
        { reply_markup: await BotKeyboards.getMainMenu(lang) }
      );
    });
  }

  /**
   * Admin panel ochish (/admin buyrug'i va menyu tugmasi uchun)
   */
  private async handleAdminCommand(ctx: Context, telegramId: number): Promise<void> {
    const session = this.getSession(telegramId);
    session.state = 'waiting_admin_password';
    await ctx.reply(
      "🔐 <b>Admin Panelga Kirish</b>\n━━━━━━━━━━━━━━━━━━━━\n\nIltimos, admin parolini kiriting:",
      { parse_mode: 'HTML' }
    );
  }

  /**
   * Guruh kodini tekshirish
   */
  private async handleGroupCodeVerification(
    ctx: Context,
    telegramId: number,
    enteredCode: string,
    groupId: number,
    lang: string
  ): Promise<void> {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rows.length === 0) {
      await ctx.reply("Guruh topilmadi.");
      this.clearSession(telegramId);
      return;
    }

    const group = groupRes.rows[0];
    const isCodeValid = group.access_code.trim().toUpperCase() === enteredCode.trim().toUpperCase();

    if (isCodeValid) {
      await db.query('UPDATE users SET joined_group_id = $1 WHERE telegram_id = $2', [groupId, telegramId]);
      this.clearSession(telegramId);

      let msg = `✅ <b>Tabriklaymiz!</b> Siz muvaffaqiyatli <b>${group.name}</b> guruhiga qabul qilindingiz!`;
      if (group.telegram_invite_link) {
        msg += `\n\n👉 <a href="${group.telegram_invite_link}">Guruh havolasiga o'tish</a>`;
      }

      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: await BotKeyboards.getMainMenu(lang),
      });

      if (group.telegram_chat_id && this.bot) {
        try {
          await this.bot.api.approveChatJoinRequest(group.telegram_chat_id, telegramId);
        } catch {}
      }
    } else {
      await ctx.reply("❌ Kod noto'g'ri kiritildi. Iltimos, qaytadan urinib ko'ring:");
    }
  }

  /**
   * Guruhlar ro'yxati
   */
  private async handleGroupsList(ctx: Context, telegramId: number, lang: string): Promise<void> {
    const groupsRes = await db.query('SELECT id, name, description FROM groups WHERE is_active = TRUE ORDER BY id ASC');

    if (groupsRes.rows.length === 0) {
      await ctx.reply("Hozirda faol guruhlar mavjud emas.");
      return;
    }

    const titleMsg = "👥 <b>Mavjud o'quv guruhlari:</b>\nKirish kodini kiritish uchun kerakli guruhni tanlang:";
    const keyboard = BotKeyboards.createGroupsKeyboard(groupsRes.rows);
    await ctx.reply(titleMsg, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  /**
   * BARCHA GURUHLAR STATISTIKASI VA REYTINGI
   * Guruh tanlash olib tashlangan — butun maktab bitta reytingda ko'rsatiladi.
   * Bitta ⬇️ / ⬆️ tugmasi bilan ochilib-yopiladi, bot chati to'lib ketmaydi!
   */
  private async renderAllGroupsStatsCard(
    ctx: Context,
    telegramId: number,
    lang: string,
    isExpanded: boolean = false,
    isEdit: boolean = false
  ): Promise<void> {
    // 1. Foydalanuvchining o'z ma'lumotlari
    const userRes = await db.query(
      `SELECT u.id, u.telegram_id, u.first_name, u.joined_group_id,
        g.name as group_name,
        COALESCE(SUM(sg.grade), 0) as total_score,
        COUNT(sg.id) as grades_count
       FROM users u
       LEFT JOIN groups g ON g.id = u.joined_group_id
       LEFT JOIN student_grades sg ON sg.user_id = u.id
       WHERE u.telegram_id = $1
       GROUP BY u.id, u.telegram_id, u.first_name, u.joined_group_id, g.name`,
      [telegramId]
    );
    const currentUser = userRes.rows[0];

    // 2. O'quvchilar ro'yxati (Barcha guruhlar bo'yicha opshe ballarga qarab saralash)
    const rankingRes = await db.query(
      `SELECT u.id, u.telegram_id, u.first_name, u.username,
        COALESCE(g.name, 'Guruhsiz') as group_name,
        COALESCE(SUM(sg.grade), 0) as total_score,
        COUNT(sg.id) as grades_count
       FROM users u
       LEFT JOIN groups g ON g.id = u.joined_group_id
       LEFT JOIN student_grades sg ON sg.user_id = u.id
       GROUP BY u.id, u.telegram_id, u.first_name, u.username, g.name
       ORDER BY total_score DESC, u.id ASC`
    );
    const rankingList = rankingRes.rows;

    // 3. Foydalanuvchining o'rni
    let userRank = -1;
    for (let i = 0; i < rankingList.length; i++) {
      if (Number(rankingList[i].telegram_id) === Number(telegramId)) {
        userRank = i + 1;
        break;
      }
    }

    let report = `📊 <b>O'QUVCHILAR REYTINGI VA STATISTIKASI</b>\n`;
    report += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (currentUser) {
      const userGroup = currentUser.group_name ? currentUser.group_name : "Guruhsiz";
      report += `🏫 <b>Sizning guruhingiz:</b> <b>${userGroup}</b>\n`;
      if (userRank > 0) {
        report += `🏆 <b>Sizning o'rningiz:</b> <b>${userRank}-o'rin</b> (umumiy reytingda)\n`;
      }
      report += `⭐️ <b>Sizning jami ballingiz:</b> <b>${currentUser.total_score} ball</b>\n`;
      report += `📝 <b>Qo'yilgan jami baholar soni:</b> <b>${currentUser.grades_count} ta baho</b>\n`;
    } else {
      report += `ℹ️ <i>Siz hali tizimda baholanmagansiz</i>\n`;
    }

    report += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (isExpanded) {
      report += `🏅 <b>Umumiy Reyting Jadvali (Barcha guruhlar):</b>\n\n`;

      if (rankingList.length === 0) {
        report += `<i>Hozircha reytingda o'quvchilar yo'q.</i>\n`;
      } else {
        rankingList.forEach((st, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<b>#${idx + 1}</b>`;
          const name = st.first_name || (st.username ? `@${st.username}` : `O'quvchi`);
          const isMe = Number(st.telegram_id) === Number(telegramId);
          if (isMe) {
            report += `${medal} <b>${name}</b> [<i>${st.group_name}</i>] — ⭐️ <b>${st.total_score} ball</b> (${st.grades_count} ta baho) 👈 (Siz)\n`;
          } else {
            // Boshqa foydalanuvchilar haqida faqat o'rin va umumiy baholar ko'rinadi (guruhi ko'rinmaydi)
            report += `${medal} <b>${name}</b> — ⭐️ <b>${st.total_score} ball</b> (${st.grades_count} ta baho)\n`;
          }
        });
      }
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
    } else {
      report += `💡 <i>Barcha guruhlarning to'liq reyting jadvalini ko'rish uchun pastdagi tugmani bosing:</i>\n`;
    }

    const kb = BotKeyboards.getStatsToggleKeyboard(isExpanded, lang);

    if (isEdit && ctx.chat) {
      try {
        await ctx.editMessageText(report, { parse_mode: 'HTML', reply_markup: kb });
        return;
      } catch (e) {}
    }

    await ctx.reply(report, { parse_mode: 'HTML', reply_markup: kb });
  }

  /**
   * Aloqa / Yordam bo'limi (Admin Telegram shaxsiy chatiga to'g'ridan-to'g'ri o'tish)
   */
  private async handleSupportInfo(ctx: Context, lang: string): Promise<void> {
    const adminUrl = this.getAdminTelegramUrl("Assalomu alaykum, arab tili kurslari bo'yicha savolim bor edi");
    const kb = BotKeyboards.getContactAdminKeyboard(adminUrl, lang, '💬 Admin Shaxsiy Chatiga Yozish');

    const msg =
      `💬 <b>Admin bilan Bog'lanish Markazi</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Arab tili kurslari, to'lovlar va boshqa barcha savollaringiz bo'yicha to'g'ridan-to'g'ri administrator shaxsiy chatiga murojaat qilishingiz mumkin.\n\n` +
      `👇 Administrator bilan shaxsiy chatda bog'lanish uchun pastdagi tugmani bosing:`;

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  }

  /**
   * To'lov bo'limi (Admin Telegram shaxsiy chatiga to'g'ridan-to'g'ri o'tish)
   */
  private async handlePaymentRequest(ctx: Context, telegramId: number, lang: string): Promise<void> {
    const adminUrl = this.getAdminTelegramUrl("Assalomu alaykum, arab tili kursiga yozilmoqchiman, to'lov ma'lumotlarini bering");
    const kb = BotKeyboards.getContactAdminKeyboard(adminUrl, lang, '💬 To\'lov uchun Admin Chatiga O\'tish');

    const msg =
      `💳 <b>Kurs To'lovi va Qabul</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Kursga yozilish, to'lov rekvizitlarini olish va guruhga kirish kodini tasdiqlatish administrator orqali amalga oshiriladi.\n\n` +
      `<b>Qabul tartibi:</b>\n` +
      `1️⃣ Pastdagi tugma orqali administrator bilan bog'laning;\n` +
      `2️⃣ To'lovni amalga oshirib, chekni yuboring;\n` +
      `3️⃣ Administrator sizga maxsus guruh kodini taqdim etadi;\n` +
      `4️⃣ Botdagi "👥 O'quv Guruhlari" bo'limida kodni kiritib darslarni boshlang!\n\n` +
      `👇 Administrator bilan shaxsiy chatda bog'lanish:`;

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  }

  /**
   * Test boshlash (Band 1 & 5: Kitob va mavzular asosida qattiq test, umumiy xato xabarisiz)
   */
  private async startQuiz(ctx: Context, telegramId: number, lang: string, isDaily: boolean = true): Promise<void> {
    const waitMsg = await ctx.reply("⏳ <i>Arab tili test savollari tayyorlanmoqda...</i>", { parse_mode: 'HTML' });

    try {
      // 1. Foydalanuvchi ilgari to'g'ri yechgan savollar ro'yxatini olamiz (qayta takrorlanmasligi uchun)
      const prevCorrectRes = await db.query(
        `SELECT DISTINCT question FROM user_quiz_history 
         WHERE telegram_id = $1 AND is_correct = TRUE 
         ORDER BY question ASC LIMIT 50`,
        [telegramId]
      );
      const excludedQuestions = prevCorrectRes.rows.map((r: any) => r.question);

      // 2. Admin panelda sozlangan test parametrlarini yuklaymiz
      const tSettingsRes = await db.query('SELECT * FROM test_settings LIMIT 1');
      const tSettings = tSettingsRes.rows[0];

      const bookText = tSettings?.book_text || undefined;
      const topicsRange = tSettings?.selected_topics || 'all';
      let questionTypes: string[] | undefined = undefined;
      try {
        if (tSettings?.question_types) {
          questionTypes = typeof tSettings.question_types === 'string'
            ? JSON.parse(tSettings.question_types)
            : tSettings.question_types;
        }
      } catch {}

      const qCount = tSettings?.question_count ? Number(tSettings.question_count) : 5;

      let questions: QuizQuestion[] = [];
      try {
        questions = await GeminiService.generateHardTestQuestions({
          bookText,
          topicsRange,
          questionTypes,
          count: qCount,
          excludedQuestions,
          lang,
        });
      } catch (genErr) {
        console.warn('generateHardTestQuestions error, fallback questions ishlatiladi:', genErr);
        questions = GeminiService.getFilteredFallbackQuestions(lang, excludedQuestions).slice(0, qCount);
      }

      if (!questions || questions.length === 0) {
        questions = GeminiService.getFilteredFallbackQuestions(lang).slice(0, qCount);
      }

      const session = this.getSession(telegramId);
      session.state = 'taking_test';
      session.testQuestions = questions;
      session.testAttempts = [];
      session.testCurrentIndex = 0;
      session.testScore = 0;
      session.isDailyTest = isDaily;

      await this.sendNextQuizQuestion(ctx, telegramId, session, lang, waitMsg.message_id);
    } catch (err) {
      console.error('startQuiz xatoligi (Band 1 bo\'yicha zaxira):', err);
      // Agar qandaydir kutilmagan xato bo'lsa ham umumiy xato xabari chiqmasin, zaxira savollari bilan test boshlanadi
      const fallbackQuestions = GeminiService.getFilteredFallbackQuestions(lang).slice(0, 5);
      const session = this.getSession(telegramId);
      session.state = 'taking_test';
      session.testQuestions = fallbackQuestions;
      session.testAttempts = [];
      session.testCurrentIndex = 0;
      session.testScore = 0;
      session.isDailyTest = isDaily;

      await this.sendNextQuizQuestion(ctx, telegramId, session, lang, waitMsg.message_id);
    }
  }

  private async sendNextQuizQuestion(
    ctx: Context,
    telegramId: number,
    session: UserSessionState,
    lang: string,
    editMessageId?: number
  ): Promise<void> {
    if (!session.testQuestions) return;

    const idx = session.testCurrentIndex || 0;
    const total = session.testQuestions.length;
    const q = session.testQuestions[idx];

    const topicText = q.topic ? ` (Mavzu: <i>${q.topic}</i>)` : '';
    const title = `📝 <b>${idx + 1}-savol (jami ${total} ta):</b>${topicText}\n━━━━━━━━━━━━━━━━━━━━\n\n${q.question}`;
    const keyboard = BotKeyboards.createQuizKeyboard(q.options);

    if (editMessageId && ctx.chat) {
      try {
        await ctx.api.editMessageText(ctx.chat.id, editMessageId, title, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        return;
      } catch (err) {}
    }

    await ctx.reply(title, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  /**
   * Test xulosasi matnini shakllantirish (xatolar ochilgan yoki yopilgan holatda)
   */
  private renderQuizSummaryText(session: UserSessionState, isOpen: boolean, lang: string): string {
    const score = session.lastQuizScore || 0;
    const total = session.lastQuizTotal || 5;
    const wrong = total - score;
    const percentage = session.lastQuizPercentage || 0;
    const levelTitle = session.lastQuizLevelTitle || "A1 Boshlang'ich Daraja";
    const comment = session.lastQuizComment || "";

    let text =
      `🎉 <b>Test Yakunlandi!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ <b>To'g'ri javoblar:</b> <b>${score} ta</b>\n` +
      `❌ <b>Xato javoblar:</b> <b>${wrong} ta</b>\n` +
      `🎯 <b>Aniqlangan darajangiz:</b> <b>${levelTitle}</b> (${percentage}%)\n`;

    if (comment) {
      text += `💡 <i>${comment}</i>\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (wrong === 0) {
      text += `\n👏 <b>Barakalla!</b> Barcha savollarga 100% to'g'ri javob berdingiz!`;
      return text;
    }

    if (isOpen) {
      text += `\n🔍 <b>Xato qilingan savollar va to'g'ri javoblari:</b>\n\n`;
      const wrongList = (session.lastQuizAttempts || []).filter((a) => !a.isCorrect);

      wrongList.forEach((att, idx) => {
        text += `<b>${idx + 1}-savol:</b> ${att.question}\n`;
        text += `   ❌ <b>Sizning javobingiz:</b> <s>${att.userAnswerText}</s>\n`;
        text += `   ✅ <b>To'g'ri javob:</b> <b>${att.correctAnswerText}</b>\n`;
        if (att.explanation) {
          text += `   💡 <i>Izoh:</i> ${att.explanation}\n`;
        }
        text += `\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━`;
    } else {
      text += `\n💡 <i>Xato qilingan savollar va to'g'ri javoblarini ko'rish uchun pastdagi tugmani bosing:</i>`;
    }

    return text;
  }

  private async finishQuiz(
    ctx: Context,
    telegramId: number,
    session: UserSessionState,
    lang: string
  ): Promise<void> {
    const score = session.testScore || 0;
    const total = session.testQuestions?.length || 5;
    const wrong = total - score;
    const percentage = Math.round((score / total) * 100);

    let level = 'A1';
    let levelTitle = "A1 Boshlang'ich Daraja";
    let comment = "Arab tili harflari, tovushlar va asosiy so'z boyligini mustahkamlash tavsiya etiladi.";

    if (percentage >= 80) {
      level = 'B2';
      levelTitle = "B2 Yuqori Daraja";
      comment = "Ajoyib natija! Murakkab nahv, sarf va erkin suhbat darajasi.";
    } else if (percentage >= 60) {
      level = 'B1';
      levelTitle = "B1 O'rta-Yuqori Daraja";
      comment = "Yaxshi natija! Sarf va jumlalar tahliliga ko'proq e'tibor qarating.";
    } else if (percentage >= 40) {
      level = 'A2';
      levelTitle = "A2 O'rta Daraja";
      comment = "Qoniqarli! Grammatika va lug'at ustida ishlashni davom ettiring.";
    }

    // Natijani bazaga yozish (Band 1: Test xatosi bo'lsa ham hech qachon yiqilmasdan yakunlansin)
    try {
      const userRes = await db.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
      const userId = userRes.rows[0]?.id;

      if (userId) {
        await db.query(
          `INSERT INTO user_tests (user_id, telegram_id, score, total_questions, percentage, level, recommended_course)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, telegramId, score, total, percentage, level, levelTitle]
        );
      }

      if (session.isDailyTest) {
        const today = getTashkentDate();
        await db.query(
          `INSERT INTO daily_test_attempts (telegram_id, test_date, score, total)
           VALUES ($1, $2, $3, $4)`,
          [telegramId, today, score, total]
        );
      }
    } catch (dbErr) {
      console.warn('⚠️ [finishQuiz db save error]:', dbErr);
    }

    // Natijalarni sessiyada saqlash (bitta tugma orqali ochib-yopish uchun)
    session.lastQuizAttempts = session.testAttempts ? [...session.testAttempts] : [];
    session.lastQuizScore = score;
    session.lastQuizTotal = total;
    session.lastQuizPercentage = percentage;
    session.lastQuizLevelTitle = levelTitle;
    session.lastQuizComment = comment;

    session.state = 'idle';
    session.testQuestions = undefined;
    session.testAttempts = undefined;
    session.testCurrentIndex = 0;
    session.testScore = 0;

    const summaryText = this.renderQuizSummaryText(session, false, lang);
    const kb = wrong > 0 ? BotKeyboards.getQuizReviewKeyboard(false, lang) : undefined;

    await ctx.reply(summaryText, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  }

  /**
   * AI Ustoz — Yangi dars sessiyasini boshlash yoki davom ettirish
   * (Band 3 & 4: Nom "AI Ustoz", kitob nomi sir, 1-mavzudan boshlab ketma-ket dars)
   */
  private async handleAITutorStart(ctx: Context, telegramId: number, lang: string): Promise<void> {
    const session = this.getSession(telegramId);
    session.state = 'chatting_with_ai_tutor';
    const exitKb = BotKeyboards.getAITutorExitKeyboard(lang);

    // 1. Foydalanuvchi ma'lumotlarini olish
    const userRes = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    const user = userRes.rows[0];
    if (!user) return;

    // 2. Mavzular ro'yxatini shakllantirish (Guruh kitobi yoki default darslik)
    let topics: Array<{ number: number; title: string; summary: string; rules: string }> = [];

    if (user.joined_group_id) {
      const grpRes = await db.query('SELECT book_topics FROM groups WHERE id = $1', [user.joined_group_id]);
      const rawTopics = grpRes.rows[0]?.book_topics;
      if (rawTopics) {
        try {
          const parsed = typeof rawTopics === 'string' ? JSON.parse(rawTopics) : rawTopics;
          if (Array.isArray(parsed) && parsed.length > 0) {
            topics = parsed.map((t: any) => ({
              number: Number(t.topic_number || t.number || 1),
              title: String(t.title || `Mavzu ${t.number}`),
              summary: String(t.content_summary || t.summary || ''),
              rules: String(t.key_rules || t.rules || ''),
            }));
          }
        } catch {}
      }
    }

    if (topics.length === 0) {
      topics = [...PdfBookService.getDefaultTopics()];
    }

    // 3. user_study_progress jadvalidan o'quvchi bosqichini olish
    const progRes = await db.query('SELECT * FROM user_study_progress WHERE telegram_id = $1', [telegramId]);
    let progress = progRes.rows[0];

    if (!progress) {
      const insRes = await db.query(
        `INSERT INTO user_study_progress (user_id, telegram_id, current_topic_index, last_topic_passed, study_step_state)
         VALUES ($1, $2, 1, 0, 'learning') RETURNING *`,
        [user.id, telegramId]
      );
      progress = insRes.rows[0];
    }

    // Agar o'quvchi oldingi mavzu savolidan yiqilib, admin tomonidan belgilanishini kutayotgan bo'lsa
    if (progress.study_step_state === 'blocked_review_failed') {
      await ctx.reply(
        `⚠️ <b>Darslar vaqtincha to'xtatilgan</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Siz o'tilgan mavzular bo'yicha nazorat savolidan o'ta olmadingiz. Bu haqda ustozga (adminga) xabar berildi.\n\n` +
        `Ustoz siz uchun qaysi mavzudan qayta boshlashni belgilaganidan so'ng darslarimiz davom etadi. Iltimos, kuting!`,
        { parse_mode: 'HTML', reply_markup: exitKb }
      );
      return;
    }

    // Agar hozirda javob kutilayotgan faol savol bo'lsa
    if (progress.study_step_state === 'waiting_answer' && progress.active_question) {
      session.activeStudyTopicNumber = progress.current_topic_index;
      session.activeStudyQuestion = progress.active_question;
      session.activeStudyQuestionType = (progress.active_question_type as any) || 'check';

      await ctx.reply(
        `📚 <b>AI Ustoz darsi davom etmoqda</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Sizga berilgan savol:\n<b>${progress.active_question}</b>\n\n` +
        `<i>Iltimos, javobingizni yozib yuboring:</i>`,
        { parse_mode: 'HTML', reply_markup: exitKb }
      );
      return;
    }

    // Yangi mavzu darsini boshlash
    const currentTopicNum = progress.current_topic_index || 1;
    const currentTopic = topics.find(t => t.number === currentTopicNum) || topics[0];

    await ctx.replyWithChatAction('typing').catch(() => {});
    const studentName = user.first_name || 'O\'quvchi';

    const lessonResult = await GeminiService.teachTopicLesson(currentTopic, studentName, lang);

    session.activeStudyTopicNumber = currentTopic.number;
    session.activeStudyQuestion = lessonResult.question;
    session.activeStudyQuestionType = 'check';

    await db.query(
      `UPDATE user_study_progress 
       SET active_question = $1, active_question_type = 'check', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2`,
      [lessonResult.question, telegramId]
    );

    const fullLessonMsg =
      `📖 <b>${currentTopic.number}-Mavzu: ${currentTopic.title}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${lessonResult.lessonText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `❓ <b>Mavzu yuzasidan tekshiruv savoli:</b>\n` +
      `<b>${lessonResult.question}</b>\n\n` +
      `<i>Tushunganingiz asosida javobingizni yozib yuboring:</i>`;

    await ctx.reply(fullLessonMsg, { parse_mode: 'HTML', reply_markup: exitKb });
  }

  /**
   * AI Ustoz — O'quvchi javobini tekshirish va oldingi mavzulardan nazorat qilish
   */
  private async handleAITutorUserMessage(ctx: Context, telegramId: number, text: string, lang: string): Promise<void> {
    const session = this.getSession(telegramId);
    const exitKb = BotKeyboards.getAITutorExitKeyboard(lang);

    const userRes = await db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    const user = userRes.rows[0];
    if (!user) return;

    const progRes = await db.query('SELECT * FROM user_study_progress WHERE telegram_id = $1', [telegramId]);
    const progress = progRes.rows[0];

    if (!progress || progress.study_step_state === 'blocked_review_failed') {
      await ctx.reply(
        `⚠️ Darslar to'xtatilgan. Ustoz (admin) qayta boshlash mavzusini belgilashini kuting!`,
        { reply_markup: exitKb }
      );
      return;
    }

    // Guruh yoki standart mavzular
    let topics: Array<{ number: number; title: string; summary: string; rules: string }> = [];
    if (user.joined_group_id) {
      const grpRes = await db.query('SELECT book_topics FROM groups WHERE id = $1', [user.joined_group_id]);
      const rawTopics = grpRes.rows[0]?.book_topics;
      if (rawTopics) {
        try {
          const parsed = typeof rawTopics === 'string' ? JSON.parse(rawTopics) : rawTopics;
          if (Array.isArray(parsed) && parsed.length > 0) {
            topics = parsed.map((t: any) => ({
              number: Number(t.topic_number || t.number || 1),
              title: String(t.title || `Mavzu ${t.number}`),
              summary: String(t.content_summary || t.summary || ''),
              rules: String(t.key_rules || t.rules || ''),
            }));
          }
        } catch {}
      }
    }
    if (topics.length === 0) {
      topics = [...PdfBookService.getDefaultTopics()];
    }

    const currentTopicNum = progress.current_topic_index || 1;
    const currentTopic = topics.find(t => t.number === currentTopicNum) || topics[0];
    const question = session.activeStudyQuestion || progress.active_question || 'Arab tili qoidasi';
    const qType = session.activeStudyQuestionType || progress.active_question_type || 'check';

    await ctx.replyWithChatAction('typing').catch(() => {});

    // Javobni AI orqali mulohaza qilish
    const evalResult = await GeminiService.evaluateStudentAnswer(
      currentTopic.title,
      question,
      text,
      qType === 'review',
      lang
    );

    if (qType === 'check') {
      if (evalResult.isPassed) {
        // Joriy mavzu savolidan o'tdi!
        await db.query(
          `UPDATE user_study_progress 
           SET last_topic_passed = $1, updated_at = CURRENT_TIMESTAMP
           WHERE telegram_id = $2`,
          [currentTopicNum, telegramId]
        );

        // Vaqti-vaqti bilan (masalan, 2-mavzudan boshlab har 2-mavzuda) oldingi mavzulardan nazorat savoli
        const shouldReview = currentTopicNum > 1 && (currentTopicNum % 2 === 0);
        if (shouldReview) {
          const prevNum = Math.floor(Math.random() * (currentTopicNum - 1)) + 1;
          const prevTopic = topics.find(t => t.number === prevNum) || topics[0];

          const reviewQ = await GeminiService.generateReviewQuestion(prevTopic, lang);

          session.activeStudyQuestion = reviewQ.question;
          session.activeStudyQuestionType = 'review';
          session.activeStudyReviewTopicNumber = prevTopic.number;

          await db.query(
            `UPDATE user_study_progress 
             SET active_question = $1, active_question_type = 'review', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $2`,
            [reviewQ.question, telegramId]
          );

          const praiseAndReview =
            `🎉 <b>Barakalla!</b> ${evalResult.feedback}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔄 <b>Mustahkamlash: Oldingi o'tilgan mavzudan jiddiy nazorat savoli</b>\n` +
            `<b>${reviewQ.question}</b>\n\n` +
            `<i>Ushbu savolga ham diqqat bilan to'liq javob bering:</i>`;

          await ctx.reply(praiseAndReview, { parse_mode: 'HTML', reply_markup: exitKb });
          return;
        }

        // Agar review bo'lmasa, keyingi darsga o'tamiz
        await this.advanceToNextTopic(ctx, telegramId, currentTopicNum, topics, user, lang, exitKb);
      } else {
        // Joriy mavzu savolidan o'tolmadi
        await ctx.reply(
          `😊 <b>Ustoz izohi:</b> ${evalResult.feedback}\n\n` +
          `Iltimos, qayta o'ylab ko'rib, to'liqroq javob yozing:`,
          { parse_mode: 'HTML', reply_markup: exitKb }
        );
      }
    } else if (qType === 'review') {
      // Oldingi mavzu nazorat savoli
      const reviewTopicNum = session.activeStudyReviewTopicNumber || 1;
      const reviewTopic = topics.find(t => t.number === reviewTopicNum) || topics[0];

      if (evalResult.isPassed) {
        // Reviewdan o'tdi!
        await ctx.reply(
          `🌟 <b>Ofarin!</b> Oldingi mavzuni ham puxta eslab qolibsiz!\n${evalResult.feedback}\n\n` +
          `Endi navbatdagi yangi darsimizga o'tamiz...`,
          { parse_mode: 'HTML' }
        );
        await this.advanceToNextTopic(ctx, telegramId, currentTopicNum, topics, user, lang, exitKb);
      } else {
        // Reviewdan O'TOLMADI!
        // Admin panelga xabar qilinadi: "[Foydalanuvchi] [mavzu]dan o'tolmadi"
        const studentDisplayName = user.first_name || (user.username ? `@${user.username}` : `O'quvchi #${user.id}`);

        await db.query(
          `INSERT INTO student_failed_alerts 
           (student_id, telegram_id, student_name, failed_topic_number, failed_topic_title, question_text, student_answer, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
          [
            user.id,
            telegramId,
            studentDisplayName,
            reviewTopic.number,
            reviewTopic.title,
            question,
            text,
          ]
        );

        await db.query(
          `UPDATE user_study_progress 
           SET study_step_state = 'blocked_review_failed', review_fail_count = review_fail_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE telegram_id = $1`,
          [telegramId]
        );

        // Adminga Telegram bot orqali ham xabar yuborish
        if (config.adminId) {
          const adminAlertText =
            `🔔 <b>DIQQAT! O'quvchi darsdan o'tolmadi</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 O'quvchi: <b>${studentDisplayName}</b>\n` +
            `❌ O'tolmagan mavzu: <b>${reviewTopic.number}-mavzu (${reviewTopic.title})</b>\n` +
            `❓ Savol: <i>${question}</i>\n` +
            `💬 Javobi: <i>${text}</i>\n\n` +
            `👉 Admin panel orqali o'quvchi qaysi mavzudan qayta boshlashini belgilang.`;
          await this.sendToUser(config.adminId, adminAlertText);
        }

        await ctx.reply(
          `⚠️ <b>Ustoz:</b> ${evalResult.feedback}\n\n` +
          `Mavzularni mukammal o'zlashtirish juda muhim. Siz ushbu nazorat savolidan o'ta olmadingiz.\n\n` +
          `Bu haqda adminga (ustozga) xabar berildi. Admin qayta boshlash mavzusini belgilaganidan so'ng darsimiz davom etadi.`,
          { parse_mode: 'HTML', reply_markup: exitKb }
        );
      }
    }
  }

  /**
   * Keyingi mavzuga o'tish va dars berish
   */
  private async advanceToNextTopic(
    ctx: Context,
    telegramId: number,
    currentTopicNum: number,
    topics: Array<{ number: number; title: string; summary: string; rules: string }>,
    user: any,
    lang: string,
    exitKb: any
  ): Promise<void> {
    const nextTopicNum = currentTopicNum + 1;
    const nextTopic = topics.find(t => t.number === nextTopicNum);

    if (!nextTopic) {
      await db.query(
        `UPDATE user_study_progress 
         SET study_step_state = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = $1`,
        [telegramId]
      );
      await ctx.reply(
        `🏆 <b>TABRIKLAYMIZ!</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Siz darslikning barcha mavzularini muvaffaqiyatli o'zlashtirib yakunladingiz! Arab tili bo'yicha ilmingiz bardavom bo'lsin!`,
        { parse_mode: 'HTML', reply_markup: exitKb }
      );
      return;
    }

    await db.query(
      `UPDATE user_study_progress 
       SET current_topic_index = $1, study_step_state = 'learning', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2`,
      [nextTopicNum, telegramId]
    );

    await ctx.replyWithChatAction('typing').catch(() => {});
    const studentName = user.first_name || 'O\'quvchi';
    const lessonResult = await GeminiService.teachTopicLesson(nextTopic, studentName, lang);

    const session = this.getSession(telegramId);
    session.activeStudyTopicNumber = nextTopic.number;
    session.activeStudyQuestion = lessonResult.question;
    session.activeStudyQuestionType = 'check';

    await db.query(
      `UPDATE user_study_progress 
       SET active_question = $1, active_question_type = 'check', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2`,
      [lessonResult.question, telegramId]
    );

    const fullMsg =
      `🎉 <b>Ofarin! Navbatdagi darsga o'tamiz:</b>\n\n` +
      `📖 <b>${nextTopic.number}-Mavzu: ${nextTopic.title}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${lessonResult.lessonText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `❓ <b>Mavzu yuzasidan tekshiruv savoli:</b>\n` +
      `<b>${lessonResult.question}</b>\n\n` +
      `<i>Javobingizni quyida yozib qoldiring:</i>`;

    await ctx.reply(fullMsg, { parse_mode: 'HTML', reply_markup: exitKb });
  }
}

export const botManager = BotManager.getInstance();
