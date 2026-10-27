"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.botManager = exports.BotManager = void 0;
const grammy_1 = require("grammy");
const index_js_1 = require("../db/index.js");
const config_js_1 = require("../config.js");
const i18n_js_1 = require("./i18n.js");
const keyboards_js_1 = require("./keyboards.js");
const gemini_js_1 = require("../services/gemini.js");
const pdfBook_js_1 = require("../services/pdfBook.js");
const academySync_js_1 = require("../services/academySync.js");
class BotManager {
    static instance;
    bot = null;
    isRunning = false;
    currentToken = '';
    sessions = new Map();
    constructor() { }
    static getInstance() {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;
    }
    getSession(telegramId) {
        if (!this.sessions.has(telegramId)) {
            this.sessions.set(telegramId, { state: 'idle' });
        }
        return this.sessions.get(telegramId);
    }
    clearSession(telegramId) {
        const s = this.getSession(telegramId);
        this.sessions.set(telegramId, { state: 'idle', isAdmin: s.isAdmin });
    }
    /**
     * Admin bilan to'g'ridan-to'g'ri Telegram shaxsiy chatiga o'tish havolasi
     * ADMIN_TELEGRAM_CONTACT yoki ADMIN_ID ishlatiladi
     */
    getAdminTelegramUrl(prefilledText) {
        const contact = (config_js_1.config.adminTelegramContact || config_js_1.config.adminId || '8145529224').trim().replace(/^@/, '');
        if (/^\d+$/.test(contact)) {
            return `tg://user?id=${contact}`;
        }
        if (prefilledText) {
            return `https://t.me/${contact}?text=${encodeURIComponent(prefilledText)}`;
        }
        return `https://t.me/${contact}`;
    }
    async getStatus() {
        const hasToken = Boolean(config_js_1.config.botToken && config_js_1.config.botToken.trim().length > 0);
        let botUsername;
        if (this.bot && this.isRunning) {
            try {
                const me = await this.bot.api.getMe();
                botUsername = me.username;
            }
            catch { }
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
    async start() {
        const activeToken = (config_js_1.config.botToken || '').trim();
        if (!activeToken) {
            console.error('❌ [Telegram Bot] Bot tokeni (.env dagi BOT_TOKEN) topilmadi.');
            this.isRunning = false;
            return;
        }
        if (!/^\d+$/.test(config_js_1.config.adminId)) {
            console.warn('⚠️ [Telegram Bot] ADMIN_ID raqamli Telegram ID bo‘lishi kerak; /admin buyrug‘i ishlamaydi.');
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
            const testBot = new grammy_1.Bot(activeToken);
            const me = await testBot.api.getMe();
            console.log(`✅ [Telegram Bot] Bot yaroqli: @${me.username}`);
            this.currentToken = activeToken;
            this.bot = new grammy_1.Bot(activeToken);
            this.setupHandlers(this.bot);
            // Webhookni tozalash
            await this.bot.api.deleteWebhook({ drop_pending_updates: true }).catch((err) => {
                console.warn('⚠️ [Telegram Bot] Webhook tozalashda ogohlantirish:', err.message);
            });
            // Buyruqlarni o'rnatish: Faqat /start
            await this.bot.api.setMyCommands([
                { command: 'start', description: "Botni qayta ishga tushirish" },
                { command: 'review', description: "Kurs haqida sharh yuborish" },
            ]).catch(() => { });
            await this.bot.api.setChatMenuButton({
                menu_button: { type: 'default' },
            }).catch(() => { });
            this.bot
                .start({
                onStart: (info) => {
                    this.isRunning = true;
                    console.log(`🚀 [Telegram Bot] @${info.username} muvaffaqiyatli ishga tushdi!`);
                },
            })
                .catch((err) => {
                this.isRunning = false;
                const message = err?.message || String(err);
                if (/409|terminated by other getUpdates request|conflict/i.test(message)) {
                    console.error('❌ [Telegram Bot] Shu BOT_TOKEN bilan boshqa bot jarayoni ham ishlayapti. Sayt backend va bot service orasida bitta polling nusxasini qoldiring.');
                }
                console.warn('⚠️ [Telegram Bot] Polling xatosi:', message);
            });
        }
        catch (err) {
            this.isRunning = false;
            console.error('❌ [Telegram Bot] Botni ishga tushirishda xatolik:', err?.message || err);
        }
    }
    async restart() {
        console.log('🔄 [Telegram Bot] Bot qayta yuklanmoqda...');
        await this.stop();
        await this.start();
    }
    async stop() {
        if (this.bot && this.isRunning) {
            try {
                await this.bot.stop();
                console.log('🛑 [Telegram Bot] Bot to\'xtatildi.');
            }
            catch (err) {
                console.warn('⚠️ [Telegram Bot] To\'xtatishda xato:', err);
            }
            finally {
                this.isRunning = false;
                this.bot = null;
            }
        }
    }
    async sendToUser(telegramId, message) {
        if (!this.bot || !this.isRunning)
            return false;
        try {
            await this.bot.api.sendMessage(Number(telegramId), message, { parse_mode: 'HTML' });
            return true;
        }
        catch (err) {
            console.error(`[Telegram Bot] Send message to ${telegramId} failed:`, err);
            return false;
        }
    }
    isUserAdmin(telegramId, session) {
        if (session?.isAdmin)
            return true;
        const strId = String(telegramId);
        return strId === config_js_1.config.adminId;
    }
    setupHandlers(bot) {
        bot.catch(async (err) => {
            console.error('[Telegram Bot Error]:', err.error);
            const ctx = err.ctx;
            if (ctx && ctx.chat) {
                const telegramId = ctx.from?.id;
                const session = telegramId ? this.getSession(telegramId) : undefined;
                if (session && session.state === 'taking_test') {
                    try {
                        const lang = telegramId ? await i18n_js_1.I18nService.getUserLanguage(telegramId) : 'uz';
                        await this.finishQuiz(ctx, telegramId, session, lang);
                    }
                    catch (finishErr) {
                        console.error('Error in finishQuiz inside bot.catch:', finishErr);
                    }
                    return;
                }
                // Talab 1: "Kechirasiz, vaqtincha nosozlik yuz berdi..." umumiy xato xabari foydalanuvchiga chiqmasin
            }
        });
        // ========================================================
        // GLOBAL GURUH KODI MIDDLEWARE (v9.1 XATO 1 TUZATISH)
        // ========================================================
        bot.use(async (ctx, next) => {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return next();
            const text = (ctx.message?.text || '').trim();
            const callbackData = ctx.callbackQuery?.data || '';
            const session = this.getSession(telegramId);
            // 1. /start, til tanlash (set_lang:), guruh tanlash, /admin va admin paroli tekshiruvlari o'tkazib yuboriladi
            const isStart = text.startsWith('/start');
            const isAdminCmd = text === '/admin' || text.startsWith('/admin ') || text.includes('Admin Panel') || text.includes('Админ Панель');
            const isGroupCallback = callbackData.startsWith('set_lang:') || callbackData.startsWith('choose_group:') || callbackData.startsWith('continue_group:') || callbackData.startsWith('join_group:');
            const isWaitingAdminPassword = session.state === 'waiting_admin_password';
            if (isStart || isAdminCmd || isGroupCallback || isWaitingAdminPassword) {
                return next();
            }
            // 2. Foydalanuvchining bazada guruhi bor va shu guruh hali mavjudligini tekshiramiz
            const userRes = await index_js_1.db.query(`SELECT u.id, u.joined_group_id, g.id as group_id, g.name as group_name, g.is_active
         FROM users u
         LEFT JOIN groups g ON g.id = u.joined_group_id
         WHERE u.telegram_id = $1`, [telegramId]);
            const user = userRes.rows[0];
            const hasValidGroup = Boolean(user && user.joined_group_id && user.group_id && user.is_active);
            // Agar guruh o'chirilgan yoki faol bo'lmasa, bazadagi joined_group_id ni tozalaymiz
            if (user && user.joined_group_id && (!user.group_id || !user.is_active)) {
                await index_js_1.db.query('UPDATE users SET joined_group_id = NULL WHERE telegram_id = $1', [telegramId]);
            }
            if (hasValidGroup) {
                return next();
            }
            // 3. Foydalanuvchining guruhi bo'lmasa — faqat kod so'raladi va tekshiriladi
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            // Agar matn yozilgan bo'lsa — admin paneldagi (umumiy bazadagi) guruh kodlari bilan solishtiriladi
            if (text) {
                const cleanCode = text.trim().toUpperCase();
                const groupRes = await index_js_1.db.query(`SELECT * FROM groups WHERE UPPER(TRIM(access_code)) = $1 AND is_active = TRUE LIMIT 1`, [cleanCode]);
                if (groupRes.rows.length > 0) {
                    const group = groupRes.rows[0];
                    await index_js_1.db.query('UPDATE users SET joined_group_id = $1 WHERE telegram_id = $2', [group.id, telegramId]);
                    session.state = 'idle';
                    // Yangi guruhga a'zo bo'lganda o'quvchini 1-darsdan boshlash
                    const progCheck = await index_js_1.db.query('SELECT id FROM user_study_progress WHERE telegram_id = $1 AND group_id = $2', [telegramId, group.id]);
                    if (progCheck.rows.length === 0) {
                        await index_js_1.db.query(`INSERT INTO user_study_progress (user_id, telegram_id, group_id, current_topic_index, last_topic_passed, study_step_state)
               VALUES ($1, $2, $3, 1, 0, 'learning')`, [user.id, telegramId, group.id]);
                    }
                    const joinedMsg = lang === 'ru'
                        ? `✅ <b>Группа подключена! (${group.name})</b>`
                        : lang === 'en'
                            ? `✅ <b>Group connected! (${group.name})</b>`
                            : `✅ <b>Guruhga qo'shildingiz! (${group.name})</b>`;
                    await ctx.reply(joinedMsg, {
                        parse_mode: 'HTML',
                        reply_markup: await keyboards_js_1.BotKeyboards.getMainMenu(lang),
                    });
                    if (group.telegram_chat_id && this.bot) {
                        try {
                            await this.bot.api.approveChatJoinRequest(group.telegram_chat_id, telegramId);
                        }
                        catch { }
                    }
                    return;
                }
                else {
                    // Kod mos kelmasa: "Kod topilmadi, qayta kiriting" — menyu ochilmaydi!
                    const notFoundMsg = lang === 'ru'
                        ? "❌ Код не найден, введите повторно:"
                        : lang === 'en'
                            ? "❌ Code not found, please enter again:"
                            : "❌ Kod topilmadi, qayta kiriting:";
                    await ctx.reply(notFoundMsg);
                    return;
                }
            }
            // Agar inline tugma bosilgan bo'lsa
            if (ctx.callbackQuery) {
                await ctx.answerCallbackQuery({
                    text: lang === 'ru' ? "Сначала введите код группы" : "Avval guruh kodini kiriting",
                    show_alert: true,
                });
                const askMsg = lang === 'ru'
                    ? "🔒 Введите код группы:"
                    : lang === 'en'
                        ? "🔒 Please enter group code:"
                        : "🔒 Guruh kodini kiriting:";
                await ctx.reply(askMsg);
                return;
            }
            // Boshqa har qanday xabarda ham faqat kod so'raladi
            const defaultAskMsg = lang === 'ru'
                ? "🔒 Введите код группы:"
                : lang === 'en'
                    ? "🔒 Please enter group code:"
                    : "🔒 Guruh kodini kiriting:";
            await ctx.reply(defaultAskMsg);
            return;
        });
        // 1. /start buyrug'i
        bot.command('start', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return;
            const firstName = ctx.from?.first_name || '';
            const username = ctx.from?.username || '';
            const userRes = await index_js_1.db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
            if (userRes.rows.length === 0) {
                await index_js_1.db.query(`INSERT INTO users (telegram_id, username, first_name, language_code, status, is_paid)
           VALUES ($1, $2, $3, 'uz', 'active', FALSE)`, [telegramId, username, firstName]);
            }
            else {
                await index_js_1.db.query(`UPDATE users SET last_active = CURRENT_TIMESTAMP, first_name = $1, username = $2 WHERE telegram_id = $3`, [firstName, username, telegramId]);
            }
            this.clearSession(telegramId);
            const langKeyboard = await keyboards_js_1.BotKeyboards.getLanguageKeyboard();
            await ctx.reply("Assalomu alaykum! Iltimos, tilni tanlang:\n\nПожалуйста, выберите язык:\n\nPlease choose your language:", { reply_markup: langKeyboard });
        });
        bot.command('review', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return;
            if (ctx.chat.type !== 'private') {
                await ctx.reply('Sharh yuborish uchun botga shaxsiy xabarda /review yuboring.');
                return;
            }
            const session = this.getSession(telegramId);
            session.state = 'waiting_review_text';
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            const prompts = {
                uz: '✍️ Kurs haqidagi fikringizni bitta xabar qilib yuboring. Admin tasdiqlagandan keyin saytda ko‘rinadi. Bekor qilish uchun /cancel yozing.',
                ru: '✍️ Отправьте одним сообщением отзыв о курсе. Он появится на сайте после одобрения администратора. Для отмены отправьте /cancel.',
                en: '✍️ Send your course review in one message. It will appear on the website after admin approval. Send /cancel to cancel.',
            };
            await ctx.reply(prompts[lang] || prompts.uz);
        });
        // 2. /admin buyrug'i (Parol so'raydi, so'ngra qulay boshqaruv panelini ochadi)
        bot.command('admin', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return;
            await this.handleAdminCommand(ctx, telegramId);
        });
        // 2.1. /ustoz buyrug'i (AI Ustoz darsini boshlash)
        bot.command('ustoz', async (ctx) => {
            const telegramId = ctx.from?.id;
            if (!telegramId)
                return;
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await this.handleAITutorStart(ctx, telegramId, lang);
        });
        // 3. Til tanlash callback (Til tanlanganda asosiy menyu emas, guruhini tanlash/kod kiritish so'raladi)
        bot.callbackQuery(/^set_lang:(.+)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const langCode = ctx.match[1];
            await i18n_js_1.I18nService.setUserLanguage(telegramId, langCode);
            await ctx.answerCallbackQuery({ text: '✅ Saqlandi' });
            // Foydalanuvchining guruhi bor-yo'qligini bazadan tekshirish
            const userRes = await index_js_1.db.query(`SELECT u.joined_group_id, g.id as group_id, g.name as group_name, g.is_active
         FROM users u
         LEFT JOIN groups g ON g.id = u.joined_group_id
         WHERE u.telegram_id = $1`, [telegramId]);
            const user = userRes.rows[0];
            const hasValidGroup = Boolean(user && user.joined_group_id && user.group_id && user.is_active);
            // Barcha faol guruhlarni olamiz
            const groupsRes = await index_js_1.db.query('SELECT id, name, access_code FROM groups WHERE is_active = TRUE ORDER BY id ASC');
            const groupKb = new grammy_1.InlineKeyboard();
            // Agar o'quvchi allaqachon biron guruhga biriktirilgan bo'lsa, davom ettirish tugmasi ham beriladi
            if (hasValidGroup) {
                const contText = langCode === 'ru'
                    ? `➡️ Продолжить: «${user.group_name}»`
                    : langCode === 'en'
                        ? `➡️ Continue: «${user.group_name}»`
                        : `➡️ Davom etish: «${user.group_name}»`;
                groupKb.text(contText, `continue_group:${user.group_id}`).row();
            }
            for (const g of groupsRes.rows) {
                if (!hasValidGroup || g.id !== user.group_id) {
                    groupKb.text(`📚 ${g.name}`, `choose_group:${g.id}`).row();
                }
            }
            const chooseMsg = langCode === 'ru'
                ? "👥 <b>Пожалуйста, выберите вашу группу или введите код доступа:</b>\n\n<i>(Код доступа к группе вы можете получить у преподавателя)</i>"
                : langCode === 'en'
                    ? "👥 <b>Please select your group or enter your group code:</b>\n\n<i>(You can get the access code from your teacher)</i>"
                    : "👥 <b>Iltimos, guruhingizni tanlang yoki guruh kodini kiriting:</b>\n\n<i>(Guruh kodini ustozingizdan yoki o'quv markazidan olasiz)</i>";
            await ctx.reply(chooseMsg, { parse_mode: 'HTML', reply_markup: groupKb });
        });
        // 3.1. Hozirgi guruhda davom etish callback
        bot.callbackQuery(/^continue_group:(\d+)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            const mainKb = await keyboards_js_1.BotKeyboards.getMainMenu(lang);
            const menuPrompt = lang === 'ru' ? "Главное меню:" : lang === 'en' ? "Main Menu:" : "Asosiy menyu:";
            await ctx.reply(menuPrompt, { reply_markup: mainKb });
        });
        // 3.2. Yangi guruhni tanlash callback (Kodni so'rash)
        bot.callbackQuery(/^choose_group:(\d+)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const groupId = parseInt(ctx.match[1], 10);
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            const groupRes = await index_js_1.db.query('SELECT * FROM groups WHERE id = $1 AND is_active = TRUE', [groupId]);
            if (groupRes.rows.length === 0) {
                await ctx.reply(lang === 'ru' ? "Группа не найдена." : "Guruh topilmadi.");
                return;
            }
            const group = groupRes.rows[0];
            const session = this.getSession(telegramId);
            session.state = 'waiting_group_code';
            session.selectedGroupId = groupId;
            const askCodeText = lang === 'ru'
                ? `🔒 Введите код доступа для группы <b>«${group.name}»</b>:`
                : lang === 'en'
                    ? `🔒 Please enter the access code for group <b>«${group.name}»</b>:`
                    : `🔒 Iltimos, <b>«${group.name}»</b> guruhining kirish kodini kiriting:`;
            await ctx.reply(askCodeText, { parse_mode: 'HTML' });
        });
        // 4. "Kursga yozilish" callback
        bot.callbackQuery('action_enroll', async (ctx) => {
            const telegramId = ctx.from.id;
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            await this.handleEnrollmentInfo(ctx, lang);
        });
        // 5. Guruh tanlash callback (join_group mosligi)
        bot.callbackQuery(/^join_group:(\d+)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const groupId = parseInt(ctx.match[1], 10);
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            const groupRes = await index_js_1.db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
            if (groupRes.rows.length === 0) {
                await ctx.reply(lang === 'ru' ? "Группа не найдена." : "Guruh topilmadi.");
                return;
            }
            const session = this.getSession(telegramId);
            session.state = 'waiting_group_code';
            session.selectedGroupId = groupId;
            const askCodeText = lang === 'ru'
                ? "Пожалуйста, введите код доступа к группе:"
                : "Iltimos, guruhga kirish maxsus kodini kiriting:";
            await ctx.reply(`🔒 <b>${groupRes.rows[0].name}</b>\n━━━━━━━━━━━━━━━━━━━━\n${askCodeText}`, { parse_mode: 'HTML' });
        });
        // 6. Statistika: Bitta tugma bilan ochib-yopish callback (⬇️ / ⬆️)
        bot.callbackQuery(/^toggle_stats:(open|close)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const action = ctx.match[1]; // 'open' or 'close'
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            await this.renderAllGroupsStatsCard(ctx, telegramId, lang, action === 'open', true);
        });
        // 7. Admin panel inline tugmalari
        bot.callbackQuery(/^admin_view:(stats|groups|students|tests|refresh)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            if (!this.isUserAdmin(telegramId)) {
                await ctx.answerCallbackQuery({ text: '⛔️ Sizda administrator huquqi yo\'q', show_alert: true });
                return;
            }
            await ctx.answerCallbackQuery();
            const adminUrl = this.getAcademyAdminUrl();
            await ctx.reply(adminUrl ? `🌐 Yagona admin panel: ${adminUrl}` : 'Sayt admin paneli havolasi sozlanmagan.');
        });
        // 8. AI Ustoz rejimini yopish callback
        bot.callbackQuery(/^(exit_gemini|exit_ai_tutor)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            this.clearSession(telegramId);
            await ctx.answerCallbackQuery({ text: 'AI Ustoz rejimidan chiqildi' });
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.reply("Asosiy menyuga qaytdingiz:", { reply_markup: await keyboards_js_1.BotKeyboards.getMainMenu(lang) });
        });
        // 9. Test javoblari callback
        bot.callbackQuery(/^quiz_answer:(\d+)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const selectedIndex = parseInt(ctx.match[1], 10);
            const session = this.getSession(telegramId);
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
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
            }
            else {
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
                await index_js_1.db.query(`INSERT INTO user_quiz_history 
           (telegram_id, question, topic, is_correct, user_answer, correct_answer, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                    telegramId,
                    question.question,
                    topicName,
                    isCorrect,
                    userAnswerText,
                    correctAnswerText,
                    question.explanation || '',
                ]);
            }
            catch (dbErr) {
                console.warn('user_quiz_history insert error:', dbErr);
            }
            // Zaif mavzular statistikasi
            try {
                const topicCheck = await index_js_1.db.query('SELECT id, correct_count, wrong_count FROM user_topic_stats WHERE telegram_id = $1 AND topic = $2', [telegramId, topicName]);
                if (topicCheck.rows.length > 0) {
                    if (isCorrect) {
                        await index_js_1.db.query('UPDATE user_topic_stats SET correct_count = correct_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [topicCheck.rows[0].id]);
                    }
                    else {
                        await index_js_1.db.query('UPDATE user_topic_stats SET wrong_count = wrong_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [topicCheck.rows[0].id]);
                    }
                }
                else {
                    await index_js_1.db.query('INSERT INTO user_topic_stats (telegram_id, topic, correct_count, wrong_count) VALUES ($1, $2, $3, $4)', [telegramId, topicName, isCorrect ? 1 : 0, isCorrect ? 0 : 1]);
                }
            }
            catch (e) {
                console.warn('user_topic_stats error:', e);
            }
            session.testCurrentIndex = currentIdx + 1;
            if (session.testCurrentIndex < session.testQuestions.length) {
                await this.sendNextQuizQuestion(ctx, telegramId, session, lang);
            }
            else {
                await this.finishQuiz(ctx, telegramId, session, lang);
            }
        });
        // 9.1. Test xatolarini bitta tugma bilan ochish / yopish callback (editMessageText orqali)
        bot.callbackQuery(/^toggle_quiz_review:(open|close)$/, async (ctx) => {
            const telegramId = ctx.from.id;
            const action = ctx.match[1];
            const session = this.getSession(telegramId);
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            await ctx.answerCallbackQuery();
            const isOpen = action === 'open';
            const text = this.renderQuizSummaryText(session, isOpen, lang);
            const kb = keyboards_js_1.BotKeyboards.getQuizReviewKeyboard(isOpen, lang);
            try {
                await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
            }
            catch (err) {
                console.warn('Quiz review toggle error:', err);
            }
        });
        // 10. Barcha matnli xabarlar
        bot.on('message:text', async (ctx) => {
            const telegramId = ctx.from.id;
            const text = ctx.message.text.trim();
            const session = this.getSession(telegramId);
            const lang = await i18n_js_1.I18nService.getUserLanguage(telegramId);
            if (session.state === 'waiting_review_text') {
                if (ctx.chat.type !== 'private') {
                    await ctx.reply('Sharhni bot bilan shaxsiy chatda yuboring.');
                    return;
                }
                if (text.toLowerCase() === '/cancel') {
                    session.state = 'idle';
                    await ctx.reply(lang === 'ru' ? 'Отправка отзыва отменена.' : lang === 'en' ? 'Review submission cancelled.' : 'Sharh yuborish bekor qilindi.');
                    return;
                }
                if (text.length > 2000) {
                    await ctx.reply(lang === 'ru' ? 'Отзыв должен быть не длиннее 2000 символов.' : lang === 'en' ? 'The review must be 2,000 characters or fewer.' : 'Sharh 2000 belgidan oshmasligi kerak.');
                    return;
                }
                try {
                    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Telegram o‘quvchi';
                    await (0, academySync_js_1.submitAcademyReview)(telegramId, name, text);
                    session.state = 'idle';
                    await ctx.reply(lang === 'ru'
                        ? '✅ Спасибо! Отзыв отправлен администратору на проверку.'
                        : lang === 'en'
                            ? '✅ Thank you! Your review has been sent to the admin for approval.'
                            : '✅ Rahmat! Sharhingiz admin tasdig‘iga yuborildi.');
                }
                catch (error) {
                    console.error('[Academy Sync] Sharhni saytga yuborib bo‘lmadi:', error.message);
                    session.state = 'idle';
                    await ctx.reply(lang === 'ru'
                        ? '❌ Не удалось отправить отзыв. Попробуйте позже.'
                        : lang === 'en'
                            ? '❌ Could not send the review. Please try again later.'
                            : '❌ Sharh yuborilmadi. Keyinroq qayta urinib ko‘ring.');
                }
                return;
            }
            // Agar global guruh kodini kutayotgan bo'lsa (Talab 2)
            if (session.state === 'waiting_group_access_code') {
                await this.handleGlobalGroupCodeVerification(ctx, telegramId, text, lang);
                return;
            }
            // Agar guruh kodini kutayotgan bo'lsa (aniq guruh)
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
            // TALAB 2: Foydalanuvchi faol guruhga a'zo bo'lishi shart!
            // Agar guruhga a'zo bo'lmasa, kiritilgan matn guruh kodimi tekshiramiz yoki kod so'raymiz
            const hasGroup = await this.ensureUserHasValidGroup(ctx, telegramId, lang);
            if (!hasGroup) {
                // Agar kiritilgan matn guruh kodi bo'lsa, darhol tekshirib ko'ramiz
                await this.handleGlobalGroupCodeVerification(ctx, telegramId, text, lang);
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
                    const testSettingsRes = await index_js_1.db.query('SELECT * FROM test_settings LIMIT 1');
                    const settings = testSettingsRes.rows[0];
                    const dailyLimit = settings && settings.test_daily_limit !== null ? Number(settings.test_daily_limit) : 1;
                    if (dailyLimit > 0) {
                        const today = (0, index_js_1.getTashkentDate)();
                        const checkAttempt = await index_js_1.db.query('SELECT COUNT(*) as count FROM daily_test_attempts WHERE telegram_id = $1 AND test_date = $2', [telegramId, today]);
                        const attemptCount = Number(checkAttempt.rows[0]?.count || 0);
                        if (attemptCount >= dailyLimit) {
                            await ctx.reply(`Siz bugungi test limitingizdan to'liq foydalandingiz.\n\n⏳ Sizning limitingiz 00:00 da ochiladi.`);
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
            await ctx.reply("Iltimos, quyidagi asosiy menyu tugmalaridan foydalaning:", { reply_markup: await keyboards_js_1.BotKeyboards.getMainMenu(lang) });
        });
    }
    /**
     * Admin panel ochish (/admin buyrug'i va menyu tugmasi uchun)
     */
    async handleAdminCommand(ctx, telegramId) {
        if (!this.isUserAdmin(telegramId)) {
            await ctx.reply("Admin panel faqat administrator uchun. O'quvchi sifatida bot menyusidan foydalaning.");
            return;
        }
        const adminUrl = this.getAcademyAdminUrl();
        await ctx.reply(adminUrl ? `🌐 Yagona admin panel: ${adminUrl}` : 'Sayt admin paneli havolasi sozlanmagan.');
    }
    getAcademyAdminUrl() {
        return config_js_1.config.academyAdminUrl || (config_js_1.config.academyApiUrl ? `${config_js_1.config.academyApiUrl}/admin` : '');
    }
    /**
     * Foydalanuvchining guruhga biriktirilganini va guruh bazada mavjud/faolligini tekshirish (Talab 1 & 2)
     */
    async ensureUserHasValidGroup(ctx, telegramId, lang) {
        const userRes = await index_js_1.db.query(`SELECT u.id, u.joined_group_id, g.id as group_id, g.name as group_name, g.is_active
       FROM users u
       LEFT JOIN groups g ON g.id = u.joined_group_id
       WHERE u.telegram_id = $1`, [telegramId]);
        const user = userRes.rows[0];
        // Agar guruh mavjud va faol bo'lsa - ruxsat beriladi
        if (user && user.joined_group_id && user.group_id && user.is_active) {
            return true;
        }
        // Agar guruh o'chirilgan yoki kodi o'zgartirilgan bo'lsa - xavfsiz tozalaymiz
        if (user && user.joined_group_id && (!user.group_id || !user.is_active)) {
            await index_js_1.db.query('UPDATE users SET joined_group_id = NULL WHERE telegram_id = $1', [telegramId]);
        }
        const session = this.getSession(telegramId);
        session.state = 'waiting_group_access_code';
        const askMsg = lang === 'ru'
            ? "🔒 <b>Пожалуйста, введите код группы из админ-панели сайта:</b>\n\n(Получите код доступа у своего преподавателя)"
            : lang === 'en'
                ? "🔒 <b>Please enter the group access code from the website admin panel:</b>\n\n(Ask your teacher for the access code)"
                : "🔒 <b>Iltimos, saytdagi (admin paneldagi) guruh kodini kiriting:</b>\n\n(Guruh kodini ustozingizdan yoki o'quv markazidan olasiz)";
        await ctx.reply(askMsg, { parse_mode: 'HTML' });
        return false;
    }
    /**
     * Saytdagi (admin paneldagi) guruh kodi orqali tekshirish va biriktirish (Talab 2)
     */
    async handleGlobalGroupCodeVerification(ctx, telegramId, enteredCode, lang) {
        const cleanCode = enteredCode.trim().toUpperCase();
        // Bazadagi barcha faol guruhlar kodlarini tekshirish
        const groupsRes = await index_js_1.db.query(`SELECT * FROM groups WHERE UPPER(TRIM(access_code)) = $1 AND is_active = TRUE LIMIT 1`, [cleanCode]);
        if (groupsRes.rows.length > 0) {
            const group = groupsRes.rows[0];
            await index_js_1.db.query('UPDATE users SET joined_group_id = $1 WHERE telegram_id = $2', [group.id, telegramId]);
            const session = this.getSession(telegramId);
            session.state = 'idle';
            let msg = lang === 'ru'
                ? `✅ <b>Поздравляем!</b> Вы успешно прикреплены к группе <b>${group.name}</b>!`
                : lang === 'en'
                    ? `✅ <b>Congratulations!</b> You have been successfully assigned to group <b>${group.name}</b>!`
                    : `✅ <b>Tabriklaymiz!</b> Siz muvaffaqiyatli <b>${group.name}</b> guruhiga biriktirildingiz!`;
            if (group.telegram_invite_link) {
                msg += `\n\n👉 <a href="${group.telegram_invite_link}">Guruh havolasiga o'tish</a>`;
            }
            await ctx.reply(msg, {
                parse_mode: 'HTML',
                reply_markup: await keyboards_js_1.BotKeyboards.getMainMenu(lang),
            });
            if (group.telegram_chat_id && this.bot) {
                try {
                    await this.bot.api.approveChatJoinRequest(group.telegram_chat_id, telegramId);
                }
                catch { }
            }
        }
        else {
            // Kod noto'g'ri bo'lsa — bot: "Guruh kodi noto'g'ri. Qaytadan kiriting:" deb qayta kiritishni so'raydi.
            const session = this.getSession(telegramId);
            session.state = 'waiting_group_access_code';
            const errorMsg = lang === 'ru'
                ? "❌ Неверный код группы. Пожалуйста, введите снова:"
                : lang === 'en'
                    ? "❌ Invalid group code. Please try again:"
                    : "❌ Guruh kodi noto'g'ri. Qaytadan kiriting:";
            await ctx.reply(errorMsg);
        }
    }
    /**
     * Guruh kodini tekshirish (aniq guruh uchun)
     */
    async handleGroupCodeVerification(ctx, telegramId, enteredCode, groupId, lang) {
        const groupRes = await index_js_1.db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
        if (groupRes.rows.length === 0) {
            await ctx.reply("Guruh topilmadi.");
            this.clearSession(telegramId);
            return;
        }
        const group = groupRes.rows[0];
        const isCodeValid = group.access_code.trim().toUpperCase() === enteredCode.trim().toUpperCase();
        if (isCodeValid) {
            await index_js_1.db.query('UPDATE users SET joined_group_id = $1 WHERE telegram_id = $2', [groupId, telegramId]);
            this.clearSession(telegramId);
            let msg = `✅ <b>Tabriklaymiz!</b> Siz muvaffaqiyatli <b>${group.name}</b> guruhiga qabul qilindingiz!`;
            if (group.telegram_invite_link) {
                msg += `\n\n👉 <a href="${group.telegram_invite_link}">Guruh havolasiga o'tish</a>`;
            }
            await ctx.reply(msg, {
                parse_mode: 'HTML',
                reply_markup: await keyboards_js_1.BotKeyboards.getMainMenu(lang),
            });
            if (group.telegram_chat_id && this.bot) {
                try {
                    await this.bot.api.approveChatJoinRequest(group.telegram_chat_id, telegramId);
                }
                catch { }
            }
        }
        else {
            await ctx.reply("❌ Guruh kodi noto'g'ri. Qaytadan kiriting:");
        }
    }
    /**
     * Guruhlar ro'yxati
     */
    async handleGroupsList(ctx, telegramId, lang) {
        const groupsRes = await index_js_1.db.query('SELECT id, name, description FROM groups WHERE is_active = TRUE ORDER BY id ASC');
        if (groupsRes.rows.length === 0) {
            await ctx.reply("Hozirda faol guruhlar mavjud emas.");
            return;
        }
        const titleMsg = "👥 <b>Mavjud o'quv guruhlari:</b>\nKirish kodini kiritish uchun kerakli guruhni tanlang:";
        const keyboard = keyboards_js_1.BotKeyboards.createGroupsKeyboard(groupsRes.rows);
        await ctx.reply(titleMsg, { parse_mode: 'HTML', reply_markup: keyboard });
    }
    /**
     * GURUH REYTINGI VA STATISTIKASI (Talab 6)
     * - Hozirgi ko'rinishi, tugmalari va hamma narsasi qoladi.
     * - Faqat ma'lumot o'quvchining guruhiga ko'ra chiqadi.
     * - Boshqa guruhdagilar ko'rinmaydi.
     * - Guruhdagi boshqalar uchun: faqat o'rni va to'plangan bahosi ko'rinadi.
     * - O'ziniki esa to'liq chiqadi.
     */
    async renderAllGroupsStatsCard(ctx, telegramId, lang, isExpanded = false, isEdit = false) {
        // 1. Foydalanuvchining o'z ma'lumotlari
        const userRes = await index_js_1.db.query(`SELECT u.id, u.telegram_id, u.first_name, u.username, u.joined_group_id,
        g.name as group_name,
        COALESCE(SUM(sg.grade), 0) as total_score,
        COUNT(sg.id) as grades_count
       FROM users u
       LEFT JOIN groups g ON g.id = u.joined_group_id
       LEFT JOIN student_grades sg ON sg.user_id = u.id
       WHERE u.telegram_id = $1
       GROUP BY u.id, u.telegram_id, u.first_name, u.username, u.joined_group_id, g.name`, [telegramId]);
        const currentUser = userRes.rows[0];
        let academyStats;
        let academyStatsError = false;
        if (config_js_1.config.academyApiUrl && config_js_1.config.academySyncSecret) {
            try {
                academyStats = await (0, academySync_js_1.getAcademyStudentStats)(telegramId);
            }
            catch (error) {
                academyStatsError = true;
                console.warn('[Academy Sync] Sayt o‘quvchi statistikasini olib bo‘lmadi:', error.message);
            }
        }
        if (!currentUser || !currentUser.joined_group_id) {
            await ctx.reply(lang === 'ru'
                ? "Вы еще не прикреплены к группе. Пожалуйста, введите код группы."
                : "Siz hali guruhga biriktirilmagansiz. Iltimos, avval guruh kodini kiriting.");
            return;
        }
        const groupId = currentUser.joined_group_id;
        const groupName = currentUser.group_name || "Guruh";
        // 2. O'quvchilar ro'yxati — FAQAT shu o'quvchining guruhi bo'yicha (Talab 6)
        const rankingRes = await index_js_1.db.query(`SELECT u.id, u.telegram_id, u.first_name, u.username,
        COALESCE(SUM(sg.grade), 0) as total_score,
        COUNT(sg.id) as grades_count
       FROM users u
       LEFT JOIN student_grades sg ON sg.user_id = u.id
       WHERE u.joined_group_id = $1
       GROUP BY u.id, u.telegram_id, u.first_name, u.username
       ORDER BY total_score DESC, u.id ASC`, [groupId]);
        const rankingList = rankingRes.rows;
        // 3. Foydalanuvchining guruhdagi o'rni
        let userRank = -1;
        for (let i = 0; i < rankingList.length; i++) {
            if (Number(rankingList[i].telegram_id) === Number(telegramId)) {
                userRank = i + 1;
                break;
            }
        }
        let report = `📊 <b>GURUH REYTINGI VA STATISTIKASI</b>\n`;
        report += `━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🏫 <b>Guruhingiz:</b> <b>${groupName}</b>\n`;
        if (userRank > 0) {
            report += `🏆 <b>Sizning o'rningiz:</b> <b>${userRank}-o'rin</b>\n`;
        }
        report += `⭐️ <b>Sizning jami ballingiz:</b> <b>${currentUser.total_score} ball</b>\n`;
        report += `📝 <b>Qo'yilgan jami baholar soni:</b> <b>${currentUser.grades_count} ta baho</b>\n`;
        report += `━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🌐 <b>Saytdagi kurs statistikangiz</b>\n`;
        if (academyStatsError) {
            report += `⚠️ <i>Sayt statistikasi hozircha yuklanmadi. Keyinroq qayta urinib ko‘ring.</i>\n`;
        }
        else if (!config_js_1.config.academyApiUrl || !config_js_1.config.academySyncSecret) {
            report += `⚠️ <i>Sayt bilan sinxronlash sozlanmagan.</i>\n`;
        }
        else if (!academyStats?.groups.length) {
            report += `ℹ️ <i>Saytda sizning Telegram ID'ingiz bilan bog‘langan faol guruh va baholar topilmadi.</i>\n`;
        }
        else {
            for (const group of academyStats.groups) {
                const progressLabel = group.progressStatus === 'improved'
                    ? `📈 +${group.progressDifference}`
                    : group.progressStatus === 'declined'
                        ? `📉 ${group.progressDifference}`
                        : group.progressStatus === 'unchanged'
                            ? '➡️ O‘zgarish yo‘q'
                            : '⏳ Hali yetarli baho yo‘q';
                report += `🏫 <b>${group.groupName}</b>\n`;
                report += `🏆 O‘rningiz: <b>${group.rank}/${group.groupSize}</b>\n`;
                report += `⭐ Joriy oy ballari: <b>${group.monthPoints}</b> · jami ball: <b>${group.totalPoints}</b>\n`;
                report += `📝 Baholangan darslar: <b>${group.gradedLessons}</b> · o‘rtacha: <b>${group.averageGrade ?? '—'}</b>\n`;
                report += `${progressLabel}\n`;
            }
        }
        report += `━━━━━━━━━━━━━━━━━━━━\n`;
        if (isExpanded) {
            report += `🏅 <b>Guruhdagi Reyting Jadvali:</b>\n\n`;
            if (rankingList.length === 0) {
                report += `<i>Hozircha guruhda boshqa natijalar yo'q.</i>\n`;
            }
            else {
                rankingList.forEach((st, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<b>#${idx + 1}</b>`;
                    const isMe = Number(st.telegram_id) === Number(telegramId);
                    if (isMe) {
                        const myName = currentUser.first_name || (currentUser.username ? `@${currentUser.username}` : `O'quvchi`);
                        report += `${medal} <b>${myName}</b> — ⭐️ <b>${st.total_score} ball</b> (${st.grades_count} ta baho) 👈 (Siz)\n`;
                    }
                    else {
                        // TALAB 6: Guruhdagi boshqalar uchun: faqat o'rni va to'plangan bahosi ko'rinadi
                        report += `${medal} — ⭐️ <b>${st.total_score} ball</b>\n`;
                    }
                });
            }
            report += `━━━━━━━━━━━━━━━━━━━━\n`;
        }
        else {
            report += `💡 <i>Guruhning to'liq reytingini ko'rish uchun pastdagi tugmani bosing:</i>\n`;
        }
        const kb = keyboards_js_1.BotKeyboards.getStatsToggleKeyboard(isExpanded, lang);
        if (isEdit && ctx.chat) {
            try {
                await ctx.editMessageText(report, { parse_mode: 'HTML', reply_markup: kb });
                return;
            }
            catch (e) { }
        }
        await ctx.reply(report, { parse_mode: 'HTML', reply_markup: kb });
    }
    /**
     * Aloqa / Yordam bo'limi (Admin Telegram shaxsiy chatiga to'g'ridan-to'g'ri o'tish)
     */
    async handleSupportInfo(ctx, lang) {
        const adminUrl = this.getAdminTelegramUrl("Assalomu alaykum, arab tili kurslari bo'yicha savolim bor edi");
        const kb = keyboards_js_1.BotKeyboards.getContactAdminKeyboard(adminUrl, lang, '💬 Admin Shaxsiy Chatiga Yozish');
        const msg = `💬 <b>Admin bilan Bog'lanish Markazi</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Arab tili kurslari va darslar bo'yicha savollaringiz uchun administratorga yozishingiz mumkin.\n\n` +
            `👇 Administrator bilan shaxsiy chatda bog'lanish uchun pastdagi tugmani bosing:`;
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            reply_markup: kb,
        });
    }
    /** Course enrollment questions are handled by the administrator. */
    async handleEnrollmentInfo(ctx, lang) {
        const adminUrl = this.getAdminTelegramUrl("Assalomu alaykum, arab tili kursiga yozilmoqchiman");
        const kb = keyboards_js_1.BotKeyboards.getContactAdminKeyboard(adminUrl, lang, '💬 Kurs haqida bog‘lanish');
        const msg = `📚 <b>Kursga yozilish</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Kursga yozilish va darslar haqida ma'lumot olish uchun administrator bilan bog'laning.\n\n` +
            `👇 Administratorning Telegram sahifasi:`;
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            reply_markup: kb,
        });
    }
    /**
     * Test boshlash (Talab 4: AI mustaqil tuzadi, faqat guruh PDF kitobidan, yetib kelgan mavzular doirasida, qiyin va aniq)
     */
    async startQuiz(ctx, telegramId, lang, isDaily = true) {
        const waitMsg = await ctx.reply("⏳ <i>Arab tili test savollari tayyorlanmoqda...</i>", { parse_mode: 'HTML' });
        try {
            // 1. Foydalanuvchi ilgari to'g'ri yechgan savollar ro'yxatini olamiz (qayta takrorlanmasligi uchun)
            const prevCorrectRes = await index_js_1.db.query(`SELECT DISTINCT question FROM user_quiz_history 
         WHERE telegram_id = $1 AND is_correct = TRUE 
         ORDER BY question ASC LIMIT 50`, [telegramId]);
            const excludedQuestions = prevCorrectRes.rows.map((r) => r.question);
            // 2. Foydalanuvchining guruhidagi PDF kitob matnini olamiz (Talab 2: faqat guruh PDF kitobi)
            const userRes = await index_js_1.db.query('SELECT joined_group_id FROM users WHERE telegram_id = $1', [telegramId]);
            const groupId = userRes.rows[0]?.joined_group_id;
            if (!groupId) {
                await ctx.reply(lang === 'ru' ? "🔒 Введите код группы:" : "🔒 Guruh kodini kiriting:");
                return;
            }
            const grpRes = await index_js_1.db.query('SELECT book_text FROM groups WHERE id = $1', [groupId]);
            const bookText = grpRes.rows[0]?.book_text;
            // Agar guruhda kitob matni bo'lmasa — muloyim xabar (boshqa kitobga o'tilmaydi!)
            if (!bookText || !bookText.trim()) {
                const noBookMsg = lang === 'ru'
                    ? "📖 Учитель еще не загрузил учебник для вашей группы. Тест будет доступен после загрузки книги."
                    : "📖 Guruhingizga hali darslik kitobi yuklanmagan. Ustoz kitob yuklaganidan so'ng test topshirishingiz mumkin.";
                await ctx.reply(noBookMsg);
                return;
            }
            // 3. O'quvchi yetib kelgan mavzular doirasini aniqlash (faqat shu guruh progressi bo'yicha)
            const progRes = await index_js_1.db.query('SELECT current_topic_index, last_topic_passed FROM user_study_progress WHERE telegram_id = $1 AND group_id = $2', [telegramId, groupId]);
            const passedTopic = progRes.rows[0]?.last_topic_passed || 0;
            const currentTopic = progRes.rows[0]?.current_topic_index || 1;
            const reachedTopicMax = Math.max(1, passedTopic, currentTopic);
            const topicsRange = `1-${reachedTopicMax}-darslar doirasi (lug'atlar va mashqlar)`;
            // Faqat o'quvchi yetib kelgan darslar matni va mashqlarini olamiz
            const studiedText = pdfBook_js_1.PdfBookService.extractLessonsUpTo(bookText, reachedTopicMax);
            // 4. AI mustaqil ravishda darslikdagi so'zlar va mashqlar asosida 5 ta savol tuzadi
            let questions = [];
            try {
                questions = await gemini_js_1.GeminiService.generateHardTestQuestions({
                    bookText: studiedText,
                    topicsRange,
                    count: 5,
                    excludedQuestions,
                    lang,
                });
            }
            catch (genErr) {
                console.warn('generateHardTestQuestions error, fallback questions ishlatiladi:', genErr);
                questions = gemini_js_1.GeminiService.getFilteredFallbackQuestions(lang, excludedQuestions).slice(0, 5);
            }
            if (!questions || questions.length === 0) {
                questions = gemini_js_1.GeminiService.getFilteredFallbackQuestions(lang).slice(0, 5);
            }
            const session = this.getSession(telegramId);
            session.state = 'taking_test';
            session.testQuestions = questions;
            session.testAttempts = [];
            session.testCurrentIndex = 0;
            session.testScore = 0;
            session.isDailyTest = isDaily;
            await this.sendNextQuizQuestion(ctx, telegramId, session, lang, waitMsg.message_id);
        }
        catch (err) {
            console.error('startQuiz xatoligi (Band 1 bo\'yicha zaxira):', err);
            // Agar qandaydir kutilmagan xato bo'lsa ham umumiy xato xabari chiqmasin, zaxira savollari bilan test boshlanadi
            const fallbackQuestions = gemini_js_1.GeminiService.getFilteredFallbackQuestions(lang).slice(0, 5);
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
    async sendNextQuizQuestion(ctx, telegramId, session, lang, editMessageId) {
        if (!session.testQuestions)
            return;
        const idx = session.testCurrentIndex || 0;
        const total = session.testQuestions.length;
        const q = session.testQuestions[idx];
        const topicText = q.topic ? ` (Mavzu: <i>${q.topic}</i>)` : '';
        const title = `📝 <b>${idx + 1}-savol (jami ${total} ta):</b>${topicText}\n━━━━━━━━━━━━━━━━━━━━\n\n${q.question}`;
        const keyboard = keyboards_js_1.BotKeyboards.createQuizKeyboard(q.options);
        if (editMessageId && ctx.chat) {
            try {
                await ctx.api.editMessageText(ctx.chat.id, editMessageId, title, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                });
                return;
            }
            catch (err) { }
        }
        await ctx.reply(title, { parse_mode: 'HTML', reply_markup: keyboard });
    }
    /**
     * Test xulosasi matnini shakllantirish (xatolar ochilgan yoki yopilgan holatda)
     */
    renderQuizSummaryText(session, isOpen, lang) {
        const score = session.lastQuizScore || 0;
        const total = session.lastQuizTotal || 5;
        const wrong = total - score;
        const percentage = session.lastQuizPercentage || 0;
        const levelTitle = session.lastQuizLevelTitle || "A1 Boshlang'ich Daraja";
        const comment = session.lastQuizComment || "";
        let text = `🎉 <b>Test Yakunlandi!</b>\n` +
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
        }
        else {
            text += `\n💡 <i>Xato qilingan savollar va to'g'ri javoblarini ko'rish uchun pastdagi tugmani bosing:</i>`;
        }
        return text;
    }
    async finishQuiz(ctx, telegramId, session, lang) {
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
        }
        else if (percentage >= 60) {
            level = 'B1';
            levelTitle = "B1 O'rta-Yuqori Daraja";
            comment = "Yaxshi natija! Sarf va jumlalar tahliliga ko'proq e'tibor qarating.";
        }
        else if (percentage >= 40) {
            level = 'A2';
            levelTitle = "A2 O'rta Daraja";
            comment = "Qoniqarli! Grammatika va lug'at ustida ishlashni davom ettiring.";
        }
        // Natijani bazaga yozish (Band 1: Test xatosi bo'lsa ham hech qachon yiqilmasdan yakunlansin)
        try {
            const userRes = await index_js_1.db.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
            const userId = userRes.rows[0]?.id;
            if (userId) {
                await index_js_1.db.query(`INSERT INTO user_tests (user_id, telegram_id, score, total_questions, percentage, level, recommended_course)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, telegramId, score, total, percentage, level, levelTitle]);
            }
            if (session.isDailyTest) {
                const today = (0, index_js_1.getTashkentDate)();
                await index_js_1.db.query(`INSERT INTO daily_test_attempts (telegram_id, test_date, score, total)
           VALUES ($1, $2, $3, $4)`, [telegramId, today, score, total]);
            }
        }
        catch (dbErr) {
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
        const kb = wrong > 0 ? keyboards_js_1.BotKeyboards.getQuizReviewKeyboard(false, lang) : undefined;
        await ctx.reply(summaryText, {
            parse_mode: 'HTML',
            reply_markup: kb,
        });
    }
    /**
     * AI Ustoz — Yangi dars sessiyasini boshlash yoki davom ettirish
     * (Band 3 & 4: Nom "AI Ustoz", kitob nomi sir, 1-mavzudan boshlab ketma-ket dars)
     */
    async handleAITutorStart(ctx, telegramId, lang) {
        const session = this.getSession(telegramId);
        session.state = 'chatting_with_ai_tutor';
        const exitKb = keyboards_js_1.BotKeyboards.getAITutorExitKeyboard(lang);
        // 1. Foydalanuvchi ma'lumotlarini olish
        const userRes = await index_js_1.db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
        const user = userRes.rows[0];
        if (!user || !user.joined_group_id) {
            await ctx.reply(lang === 'ru' ? "🔒 Введите код группы:" : "🔒 Guruh kodini kiriting:");
            return;
        }
        const groupId = user.joined_group_id;
        const grpRes = await index_js_1.db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
        const group = grpRes.rows[0];
        if (!group || !group.is_active) {
            await index_js_1.db.query('UPDATE users SET joined_group_id = NULL WHERE telegram_id = $1', [telegramId]);
            await ctx.reply(lang === 'ru' ? "Группа не найдена. Введите код группы:" : "Guruh topilmadi. Guruh kodini kiriting:");
            return;
        }
        // 2. Guruh kitobining mavzulari va matnini tekshirish (Talab 2: Guruhning PDF'i yo'q bo'lsa: "Ustoz hali kitob yuklamagan")
        let topics = [];
        if (group.book_topics) {
            try {
                const parsed = typeof group.book_topics === 'string' ? JSON.parse(group.book_topics) : group.book_topics;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    topics = parsed.map((t) => ({
                        number: Number(t.topic_number || t.number || 1),
                        title: String(t.title || `Mavzu ${t.number}`),
                        summary: String(t.content_summary || t.summary || ''),
                        rules: String(t.key_rules || t.rules || ''),
                    }));
                }
            }
            catch { }
        }
        if (topics.length === 0 || !group.book_text) {
            const noBookMsg = lang === 'ru'
                ? "📖 Учитель еще не загрузил учебник для этой группы. Пожалуйста, подождите, пока учитель загрузит книгу."
                : "📖 Ustoz hali kitob yuklamagan. Iltimos, ustoz ushbu guruhga kitob yuklashini kuting.";
            await ctx.reply(noBookMsg, { reply_markup: exitKb });
            return;
        }
        // 3. user_study_progress jadvalidan o'quvchi bosqichini olish (Talab 2: Har o'quvchining progressi (user_id, group_id) bo'yicha saqlanadi)
        let progRes = await index_js_1.db.query('SELECT * FROM user_study_progress WHERE telegram_id = $1 AND group_id = $2', [telegramId, groupId]);
        let progress = progRes.rows[0];
        if (!progress) {
            await index_js_1.db.query(`INSERT INTO user_study_progress (user_id, telegram_id, group_id, current_topic_index, last_topic_passed, study_step_state)
         VALUES ($1, $2, $3, 1, 0, 'learning')`, [user.id, telegramId, groupId]);
            progRes = await index_js_1.db.query('SELECT * FROM user_study_progress WHERE telegram_id = $1 AND group_id = $2', [telegramId, groupId]);
            progress = progRes.rows[0];
        }
        // Agar o'quvchi oldingi mavzu savolidan yiqilib, admin tomonidan belgilanishini kutayotgan bo'lsa
        if (progress?.study_step_state === 'blocked_review_failed') {
            await ctx.reply(`⚠️ <b>Darslar vaqtincha to'xtatilgan</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Siz o'tilgan mavzular bo'yicha nazorat savolidan o'ta olmadingiz. Bu haqda ustozga (adminga) xabar berildi.\n\n` +
                `Ustoz siz uchun qaysi mavzudan qayta boshlashni belgilaganidan so'ng darslarimiz davom etadi. Iltimos, kuting!`, { parse_mode: 'HTML', reply_markup: exitKb });
            return;
        }
        // Yangi odam uchun yoki joriy mavzu (har bir yangi odamga 1-darsdan boshlanadi)
        const currentTopicNum = progress?.current_topic_index || 1;
        const currentTopic = topics.find(t => t.number === currentTopicNum) || topics[0] || {
            number: 1,
            title: "1-dars: Dastlabki so'zlar",
            summary: "Dastlabki so'zlar va buyumlar",
            rules: ""
        };
        await ctx.replyWithChatAction('typing').catch(() => { });
        const studentName = user.first_name || 'O\'quvchi';
        // Aynan shu darsning PDF kitobidagi matnini ajratib olamiz
        const lessonText = pdfBook_js_1.PdfBookService.extractLessonText(group.book_text, currentTopic.number);
        const lessonResult = await gemini_js_1.GeminiService.teachTopicLesson(currentTopic, studentName, lang, lessonText);
        session.state = 'chatting_with_ai_tutor';
        session.activeStudyTopicNumber = currentTopic.number;
        session.activeStudyQuestion = lessonResult.question;
        session.activeStudyQuestionType = 'check';
        await index_js_1.db.query(`UPDATE user_study_progress 
       SET active_question = $1, active_question_type = 'check', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2 AND group_id = $3`, [lessonResult.question, telegramId, groupId]);
        const fullLessonMsg = `📖 <b>${currentTopic.number}-Dars: ${currentTopic.title}</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `${lessonResult.lessonText}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `❓ <b>Mavzu yuzasidan savol:</b>\n` +
            `<b>${lessonResult.question}</b>\n\n` +
            `<i>Javobingizni quyida yozib yuboring:</i>`;
        await ctx.reply(fullLessonMsg, { parse_mode: 'HTML', reply_markup: exitKb });
    }
    /**
     * AI Ustoz — O'quvchi javobini tekshirish va oldingi mavzulardan nazorat qilish
     */
    async handleAITutorUserMessage(ctx, telegramId, text, lang) {
        const session = this.getSession(telegramId);
        const exitKb = keyboards_js_1.BotKeyboards.getAITutorExitKeyboard(lang);
        const userRes = await index_js_1.db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
        const user = userRes.rows[0];
        if (!user || !user.joined_group_id) {
            await ctx.reply(lang === 'ru' ? "🔒 Введите код группы:" : "🔒 Guruh kodini kiriting:");
            return;
        }
        const groupId = user.joined_group_id;
        const grpRes = await index_js_1.db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
        const group = grpRes.rows[0];
        if (!group || !group.book_topics || !group.book_text) {
            await ctx.reply("📖 Ustoz hali kitob yuklamagan. Iltimos, kuting.", { reply_markup: exitKb });
            return;
        }
        const progRes = await index_js_1.db.query('SELECT * FROM user_study_progress WHERE telegram_id = $1 AND group_id = $2', [telegramId, groupId]);
        const progress = progRes.rows[0];
        if (!progress || progress.study_step_state === 'blocked_review_failed') {
            await ctx.reply(`⚠️ Darslar to'xtatilgan. Ustoz (admin) qayta boshlash mavzusini belgilashini kuting!`, { reply_markup: exitKb });
            return;
        }
        // Guruh mavzulari
        let topics = [];
        try {
            const parsed = typeof group.book_topics === 'string' ? JSON.parse(group.book_topics) : group.book_topics;
            if (Array.isArray(parsed) && parsed.length > 0) {
                topics = parsed.map((t) => ({
                    number: Number(t.topic_number || t.number || 1),
                    title: String(t.title || `Mavzu ${t.number}`),
                    summary: String(t.content_summary || t.summary || ''),
                    rules: String(t.key_rules || t.rules || ''),
                }));
            }
        }
        catch { }
        if (topics.length === 0) {
            await ctx.reply("📖 Ustoz hali kitob yuklamagan.", { reply_markup: exitKb });
            return;
        }
        const currentTopicNum = progress.current_topic_index || 1;
        const currentTopic = topics.find(t => t.number === currentTopicNum) || topics[0];
        const question = session.activeStudyQuestion || progress.active_question || 'Arab tili qoidasi';
        const qType = session.activeStudyQuestionType || progress.active_question_type || 'check';
        await ctx.replyWithChatAction('typing').catch(() => { });
        // Javobni AI orqali faqat guruh kitobi matni doirasida baholash
        const evalResult = await gemini_js_1.GeminiService.evaluateStudentAnswer(currentTopic.title, question, text, qType === 'review', lang);
        if (qType === 'check') {
            if (evalResult.isPassed) {
                // Joriy mavzu savolidan o'tdi!
                await index_js_1.db.query(`UPDATE user_study_progress 
           SET last_topic_passed = $1, updated_at = CURRENT_TIMESTAMP
           WHERE telegram_id = $2 AND group_id = $3`, [currentTopicNum, telegramId, groupId]);
                // Vaqti-vaqti bilan (masalan, 2-mavzudan boshlab har 2-mavzuda) oldingi mavzulardan nazorat savoli
                const shouldReview = currentTopicNum > 1 && (currentTopicNum % 2 === 0);
                if (shouldReview) {
                    const prevNum = Math.floor(Math.random() * (currentTopicNum - 1)) + 1;
                    const prevTopic = topics.find(t => t.number === prevNum) || topics[0];
                    const reviewQ = await gemini_js_1.GeminiService.generateReviewQuestion(prevTopic, lang);
                    session.activeStudyQuestion = reviewQ.question;
                    session.activeStudyQuestionType = 'review';
                    session.activeStudyReviewTopicNumber = prevTopic.number;
                    await index_js_1.db.query(`UPDATE user_study_progress 
             SET active_question = $1, active_question_type = 'review', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $2 AND group_id = $3`, [reviewQ.question, telegramId, groupId]);
                    const praiseAndReview = `🎉 <b>Barakalla!</b> ${evalResult.feedback}\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🔄 <b>Mustahkamlash: Oldingi o'tilgan mavzudan jiddiy nazorat savoli</b>\n` +
                        `<b>${reviewQ.question}</b>\n\n` +
                        `<i>Ushbu savolga ham diqqat bilan to'liq javob bering:</i>`;
                    await ctx.reply(praiseAndReview, { parse_mode: 'HTML', reply_markup: exitKb });
                    return;
                }
                // Agar review bo'lmasa, keyingi darsga o'tamiz
                await this.advanceToNextTopic(ctx, telegramId, currentTopicNum, topics, user, lang, exitKb, groupId, group.book_text);
            }
            else {
                // Joriy mavzu savolidan o'tolmadi
                await ctx.reply(`😊 <b>Ustoz izohi:</b> ${evalResult.feedback}\n\n` +
                    `Iltimos, qayta o'ylab ko'rib, to'liqroq javob yozing:`, { parse_mode: 'HTML', reply_markup: exitKb });
            }
        }
        else if (qType === 'review') {
            // Oldingi mavzu nazorat savoli
            const reviewTopicNum = session.activeStudyReviewTopicNumber || 1;
            const reviewTopic = topics.find(t => t.number === reviewTopicNum) || topics[0];
            if (evalResult.isPassed) {
                // Reviewdan o'tdi!
                await ctx.reply(`🌟 <b>Ofarin!</b> Oldingi mavzuni ham puxta eslab qolibsiz!\n${evalResult.feedback}\n\n` +
                    `Endi navbatdagi yangi darsimizga o'tamiz...`, { parse_mode: 'HTML' });
                await this.advanceToNextTopic(ctx, telegramId, currentTopicNum, topics, user, lang, exitKb, groupId, group.book_text);
            }
            else {
                // Reviewdan O'TOLMADI!
                // Admin panelga xabar qilinadi: "[Foydalanuvchi] [mavzu]dan o'tolmadi"
                const studentDisplayName = user.first_name || (user.username ? `@${user.username}` : `O'quvchi #${user.id}`);
                await index_js_1.db.query(`INSERT INTO student_failed_alerts 
           (student_id, telegram_id, student_name, failed_topic_number, failed_topic_title, question_text, student_answer, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`, [
                    user.id,
                    telegramId,
                    studentDisplayName,
                    reviewTopic.number,
                    reviewTopic.title,
                    question,
                    text,
                ]);
                await index_js_1.db.query(`UPDATE user_study_progress 
           SET study_step_state = 'blocked_review_failed', review_fail_count = review_fail_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE telegram_id = $1 AND group_id = $2`, [telegramId, groupId]);
                // Adminga Telegram bot orqali ham xabar yuborish
                if (config_js_1.config.adminId) {
                    const adminAlertText = `🔔 <b>DIQQAT! O'quvchi darsdan o'tolmadi</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
                        `👤 O'quvchi: <b>${studentDisplayName}</b>\n` +
                        `❌ O'tolmagan mavzu: <b>${reviewTopic.number}-mavzu (${reviewTopic.title})</b>\n` +
                        `❓ Savol: <i>${question}</i>\n` +
                        `💬 Javobi: <i>${text}</i>\n\n` +
                        `👉 Admin panel orqali o'quvchi qaysi mavzudan qayta boshlashini belgilang.`;
                    await this.sendToUser(config_js_1.config.adminId, adminAlertText);
                }
                await ctx.reply(`⚠️ <b>Ustoz:</b> ${evalResult.feedback}\n\n` +
                    `Mavzularni mukammal o'zlashtirish juda muhim. Siz ushbu nazorat savolidan o'ta olmadingiz.\n\n` +
                    `Bu haqda adminga (ustozga) xabar berildi. Admin qayta boshlash mavzusini belgilaganidan so'ng darsimiz davom etadi.`, { parse_mode: 'HTML', reply_markup: exitKb });
            }
        }
    }
    /**
     * Keyingi mavzuga o'tish va dars berish (faqat guruh PDF kitobidan)
     */
    async advanceToNextTopic(ctx, telegramId, currentTopicNum, topics, user, lang, exitKb, groupId, bookText) {
        const nextTopicNum = currentTopicNum + 1;
        const nextTopic = topics.find(t => t.number === nextTopicNum);
        if (!nextTopic) {
            await index_js_1.db.query(`UPDATE user_study_progress 
         SET study_step_state = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE telegram_id = $1 AND group_id = $2`, [telegramId, groupId]);
            await ctx.reply(`🏆 <b>TABRIKLAYMIZ!</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Siz darslikning barcha mavzularini muvaffaqiyatli o'zlashtirib yakunladingiz! Arab tili bo'yicha ilmingiz bardavom bo'lsin!`, { parse_mode: 'HTML', reply_markup: exitKb });
            return;
        }
        await index_js_1.db.query(`UPDATE user_study_progress 
       SET current_topic_index = $1, study_step_state = 'learning', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2 AND group_id = $3`, [nextTopicNum, telegramId, groupId]);
        await ctx.replyWithChatAction('typing').catch(() => { });
        const studentName = user.first_name || 'O\'quvchi';
        const lessonText = pdfBook_js_1.PdfBookService.extractLessonText(bookText, nextTopic.number);
        const lessonResult = await gemini_js_1.GeminiService.teachTopicLesson(nextTopic, studentName, lang, lessonText);
        const session = this.getSession(telegramId);
        session.activeStudyTopicNumber = nextTopic.number;
        session.activeStudyQuestion = lessonResult.question;
        session.activeStudyQuestionType = 'check';
        await index_js_1.db.query(`UPDATE user_study_progress 
       SET active_question = $1, active_question_type = 'check', study_step_state = 'waiting_answer', updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $2 AND group_id = $3`, [lessonResult.question, telegramId, groupId]);
        const fullMsg = `🎉 <b>Ofarin! Navbatdagi darsga o'tamiz:</b>\n\n` +
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
exports.BotManager = BotManager;
exports.botManager = BotManager.getInstance();
