import { Bot, InlineKeyboard, InputFile, type Context, session, type SessionFlavor, type StorageAdapter } from "grammy";
import path from "node:path";
import fs from "node:fs";
import { db, pool, usersTable, subscriptionsTable, paymentProofsTable } from "@workspace/db";
import { eq, and, desc, sql, gt, isNull, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { LANGUAGES, t, type Lang } from "./i18n";
import { PLANS, PAYMENT_METHODS, findPlanById, type Region, type PlanKey } from "./plans";
import { syncUsersToSheet, appendUserRow, syncSubscribersToSheet, syncPaymentsToSheet, appendSubscriberRow, appendPaymentRow } from "./sheets";

interface SessionData {
  awaitingProofFor?: { planId: string; method: string } | null;
  awaitingButtonEdit?: { key: string } | null;
  awaitingBroadcast?: boolean;
}

type BotContext = Context & SessionFlavor<SessionData>;

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const ADMIN_ID = Number(process.env["TELEGRAM_ADMIN_ID"] ?? 0);
const CHANNEL_ID = process.env["TELEGRAM_CHANNEL_ID"];

if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!ADMIN_ID) throw new Error("TELEGRAM_ADMIN_ID is required");
if (!CHANNEL_ID) throw new Error("TELEGRAM_CHANNEL_ID is required");

const channelIdParsed: number | string = /^-?\d+$/.test(CHANNEL_ID)
  ? Number(CHANNEL_ID)
  : CHANNEL_ID;

const BONUS_CHANNEL_ID: number = -1003774836104;

function isBonusEligible(planKey: PlanKey): boolean {
  return planKey === "monthly" || planKey === "permanent";
}

function langToRegion(lang: Lang): Region {
  if (lang === "id") return "id";
  if (lang === "my") return "my";
  return "intl";
}

function bonusNote(lang: Lang): string {
  if (lang === "id") return "\n\n🎁 <b>BONUS:</b> Dapet akses ke <b>2 channel</b> sekaligus!\n• Channel utama\n• Channel bonus eksklusif: <b>Shemale Lokal Indonesia</b> 🇮🇩";
  if (lang === "my") return "\n\n🎁 <b>BONUS:</b> Dapatkan akses ke <b>2 saluran</b> sekaligus!\n• Saluran utama\n• Saluran bonus eksklusif: <b>Shemale Tempatan Indonesia</b> 🇮🇩";
  if (lang === "ar") return "\n\n🎁 <b>مكافأة:</b> احصل على وصول إلى <b>قناتين</b>!\n• القناة الرئيسية\n• قناة المكافأة الحصرية: <b>Shemale المحلية الإندونيسية</b> 🇮🇩";
  return "\n\n🎁 <b>BONUS:</b> Get access to <b>2 channels</b> at once!\n• Main channel\n• Exclusive bonus channel: <b>Indonesian Local Shemale</b> 🇮🇩";
}

async function createBonusInviteLink(expiresAt: Date | null, proofId: number): Promise<string | null> {
  try {
    const expireUnix = expiresAt
      ? Math.floor(expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 86400 * 365 * 10;
    const link = await bot.api.createChatInviteLink(BONUS_CHANNEL_ID, {
      member_limit: 1,
      expire_date: expireUnix,
      name: `Bonus #${proofId}`,
    });
    return link.invite_link;
  } catch (err) {
    logger.error({ err }, "Failed to create bonus invite link");
    return null;
  }
}

class PostgresSessionStorage implements StorageAdapter<SessionData> {
  async read(key: string): Promise<SessionData | undefined> {
    const client = await pool.connect();
    try {
      const res = await client.query<{ value: SessionData }>(
        "SELECT value FROM bot_sessions WHERE key = $1",
        [key]
      );
      return res.rows[0]?.value ?? undefined;
    } finally {
      client.release();
    }
  }

  async write(key: string, value: SessionData): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO bot_sessions (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
    } finally {
      client.release();
    }
  }

  async delete(key: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM bot_sessions WHERE key = $1", [key]);
    } finally {
      client.release();
    }
  }
}

export const bot = new Bot<BotContext>(TOKEN);

bot.use(session({
  initial: (): SessionData => ({ awaitingProofFor: null, awaitingButtonEdit: null }),
  storage: new PostgresSessionStorage(),
}));

async function getOrCreateUser(ctx: BotContext) {
  const tg = ctx.from;
  if (!tg) return null;
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, tg.id)).limit(1);
  if (existing.length > 0) return existing[0]!;
  const inserted = await db
    .insert(usersTable)
    .values({
      telegramId: tg.id,
      username: tg.username ?? null,
      firstName: tg.first_name ?? null,
      language: "id",
      region: "id",
    })
    .returning();
  const newUser = inserted[0]!;
  // Catat user baru ke sheet (fire-and-forget)
  appendUserRow({
    telegramId: newUser.telegramId,
    username: newUser.username,
    firstName: newUser.firstName,
    language: newUser.language,
    region: newUser.region,
    createdAt: newUser.createdAt,
  }).catch(() => {});
  return newUser;
}

async function getLang(ctx: BotContext): Promise<Lang> {
  const u = await getOrCreateUser(ctx);
  return ((u?.language as Lang) ?? "id");
}

function planLabel(lang: Lang, key: PlanKey): string {
  if (key === "weekly") return t(lang, "plan_weekly");
  if (key === "monthly") return t(lang, "plan_monthly");
  return t(lang, "plan_permanent");
}

function regionLabel(lang: Lang, region: Region): string {
  if (region === "id") return t(lang, "region_id");
  if (region === "my") return t(lang, "region_my");
  return t(lang, "region_intl");
}

function languageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  LANGUAGES.forEach((l, i) => {
    kb.text(`${l.flag} ${l.label}`, `lang:${l.code}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

const PREVIEW_LINK = "https://t.me/+MIBl0i82ZMIyY2Rl";

function mainMenuKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .url("👁 Preview Channel", PREVIEW_LINK).row()
    .text(t(lang, "btn_plans"), "menu:plans").row()
    .text(t(lang, "btn_status"), "menu:status").row()
    .text(t(lang, "btn_help"), "menu:help").row()
    .text(t(lang, "btn_language"), "menu:language");
}

function regionKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "region_id"), "region:id").row()
    .text(t(lang, "region_my"), "region:my").row()
    .text(t(lang, "region_intl"), "region:intl").row()
    .text(t(lang, "btn_back"), "menu:main");
}

function plansKeyboard(lang: Lang, region: Region): InlineKeyboard {
  const kb = new InlineKeyboard();
  const keys: PlanKey[] = (region === "id" || region === "my")
    ? ["permanent"]
    : ["weekly", "monthly", "permanent"];
  keys.forEach((k) => {
    const p = PLANS[region][k];
    kb.text(`${planLabel(lang, k)} — ${p.price}`, `plan:${p.id}`).row();
  });
  kb.text(t(lang, "btn_back"), "menu:plans:back");
  return kb;
}

function paymentKeyboard(lang: Lang, planId: string, region: Region): InlineKeyboard {
  const kb = new InlineKeyboard();
  PAYMENT_METHODS[region].forEach((m) => {
    kb.text(m.label, `pay:${planId}:${m.id}`).row();
  });
  kb.text(t(lang, "btn_back"), "menu:plans");
  return kb;
}

bot.command("start", async (ctx) => {
  await getOrCreateUser(ctx);

  const introPath = path.resolve(__dirname, "../assets/intro.mp4");
  if (fs.existsSync(introPath)) {
    try {
      await ctx.replyWithVideo(new InputFile(introPath), {
        caption: "🔥 <b>Welcome!</b>\n\nSilakan pilih bahasa di bawah.",
        parse_mode: "HTML",
        supports_streaming: true,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send intro video");
    }
  }

  const previewKb = new InlineKeyboard()
    .url("👁 Preview Channel", PREVIEW_LINK).row();
  LANGUAGES.forEach((l, i) => {
    previewKb.text(`${l.flag} ${l.label}`, `lang:${l.code}`);
    if (i % 2 === 1) previewKb.row();
  });

  await ctx.reply(
    t("en", "choose_language"),
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: previewKb,
    }
  );
});

bot.command("menu", async (ctx) => {
  const lang = await getLang(ctx);
  await ctx.reply(t(lang, "main_menu"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(lang),
  });
});

bot.callbackQuery(/^lang:(.+)$/, async (ctx) => {
  const lang = ctx.match![1] as Lang;
  if (!ctx.from) return;
  const region = langToRegion(lang);
  await db
    .insert(usersTable)
    .values({ telegramId: ctx.from.id, language: lang, region })
    .onConflictDoUpdate({
      target: usersTable.telegramId,
      set: { language: lang, region, updatedAt: new Date() },
    });
  await ctx.answerCallbackQuery(t(lang, "language_set"));
  await ctx.editMessageText(t(lang, "main_menu"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(lang),
  });
});

bot.callbackQuery("menu:main", async (ctx) => {
  const lang = await getLang(ctx);
  await ctx.answerCallbackQuery();
  const text = t(lang, "main_menu");
  const reply_markup = mainMenuKeyboard(lang);
  try {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup,
    });
  } catch (err: any) {
    if (err?.description?.includes("message is not modified")) return;
    throw err;
  }
});

bot.callbackQuery("menu:language", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🌐 Pilih bahasa / Select language / Pilih bahasa / اختر اللغة", {
    reply_markup: languageKeyboard(),
  });
});

bot.callbackQuery("menu:plans", async (ctx) => {
  const lang = await getLang(ctx);
  const region = langToRegion(lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t(lang, "plans_title"), {
    parse_mode: "HTML",
    reply_markup: plansKeyboard(lang, region),
  });
});

bot.callbackQuery("menu:plans:back", async (ctx) => {
  const lang = await getLang(ctx);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t(lang, "main_menu"), {
    parse_mode: "HTML",
    reply_markup: mainMenuKeyboard(lang),
  });
});

bot.callbackQuery(/^region:(id|my|intl)$/, async (ctx) => {
  const region = ctx.match![1] as Region;
  const lang = await getLang(ctx);
  if (ctx.from) {
    await db
      .update(usersTable)
      .set({ region, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, ctx.from.id));
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`${regionLabel(lang, region)}\n\n${t(lang, "plans_title")}`, {
    parse_mode: "HTML",
    reply_markup: plansKeyboard(lang, region),
  });
});

bot.callbackQuery(/^plan:(.+)$/, async (ctx) => {
  const planId = ctx.match![1]!;
  const plan = findPlanById(planId);
  const lang = await getLang(ctx);
  if (!plan) return ctx.answerCallbackQuery("Invalid plan");
  await ctx.answerCallbackQuery();
  const duration = plan.durationDays
    ? t(lang, "duration_days", { days: plan.durationDays })
    : t(lang, "duration_permanent");
  const baseText = t(lang, "plan_detail", {
    plan: planLabel(lang, plan.key),
    price: plan.price,
    duration,
  });
  const text = isBonusEligible(plan.key) ? baseText + bonusNote(lang) : baseText;
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: paymentKeyboard(lang, planId, plan.region),
  });
});

bot.callbackQuery(/^pay:([^:]+):(.+)$/, async (ctx) => {
  const planId = ctx.match![1]!;
  const methodId = ctx.match![2]!;
  const plan = findPlanById(planId);
  const lang = await getLang(ctx);
  if (!plan) return ctx.answerCallbackQuery("Invalid");
  const method = PAYMENT_METHODS[plan.region].find((m) => m.id === methodId);
  if (!method) return ctx.answerCallbackQuery("Invalid method");
  await ctx.answerCallbackQuery();
  ctx.session.awaitingProofFor = { planId, method: method.label };
  await ctx.editMessageText(
    t(lang, "payment_instruction", {
      method: method.label,
      details: method.details,
      plan: planLabel(lang, plan.key),
      price: plan.price,
    }),
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(t(lang, "btn_back"), "menu:main"),
    }
  );

  if (methodId === "qris") {
    const qrisPath = path.resolve(__dirname, "../assets/qris.png");
    if (fs.existsSync(qrisPath)) {
      try {
        await ctx.replyWithPhoto(new InputFile(qrisPath), {
          caption: `📱 <b>QRIS — ${plan.price}</b>\n\nScan kode di atas pakai aplikasi e-wallet/m-banking favorit kamu (GoPay, OVO, DANA, ShopeePay, BCA, Mandiri, dll).`,
          parse_mode: "HTML",
        });
      } catch (err) {
        logger.error({ err }, "Failed to send QRIS photo");
      }
    } else {
      logger.warn({ qrisPath }, "QRIS image not found");
    }
  }

  if (methodId === "crypto_trc20") {
    const cryptoQrPath = path.resolve(__dirname, "../assets/crypto_trc20.png");
    if (fs.existsSync(cryptoQrPath)) {
      try {
        await ctx.replyWithPhoto(new InputFile(cryptoQrPath), {
          caption: `🔐 <b>USDT TRC-20 — ${plan.price}</b>\n\n<code>TQGa4Qj3cJ7TH32ronLS2MwMuFE9zmqtUz</code>\n\n⚠️ Make sure to use <b>TRC-20</b> network only. Sending on wrong network will result in permanent loss of funds.`,
          parse_mode: "HTML",
        });
      } catch (err) {
        logger.error({ err }, "Failed to send crypto TRC-20 QR photo");
      }
    } else {
      logger.warn({ cryptoQrPath }, "Crypto TRC-20 QR image not found");
    }
  }

  await ctx.reply(
    t(lang, "awaiting_proof", {
      plan: planLabel(lang, plan.key),
      price: plan.price,
      method: method.label,
    }),
    { parse_mode: "HTML" }
  );
});

bot.callbackQuery("menu:status", async (ctx) => {
  const lang = await getLang(ctx);
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.telegramId, ctx.from.id), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.startedAt))
    .limit(1);
  const back = new InlineKeyboard().text(t(lang, "btn_back"), "menu:main");
  if (subs.length === 0) {
    await ctx.editMessageText(t(lang, "status_none"), { parse_mode: "HTML", reply_markup: back });
    return;
  }
  const sub = subs[0]!;
  const plan = findPlanById(sub.planId);
  const planName = plan ? planLabel(lang, plan.key) : sub.planId;
  if (!sub.expiresAt) {
    await ctx.editMessageText(
      t(lang, "status_permanent", {
        plan: planName,
        started: sub.startedAt.toISOString().slice(0, 10),
      }),
      { parse_mode: "HTML", reply_markup: back }
    );
    return;
  }
  if (sub.expiresAt < new Date()) {
    await ctx.editMessageText(t(lang, "status_expired"), { parse_mode: "HTML", reply_markup: back });
    return;
  }
  await ctx.editMessageText(
    t(lang, "status_active", {
      plan: planName,
      started: sub.startedAt.toISOString().slice(0, 10),
      expires: sub.expiresAt.toISOString().slice(0, 16).replace("T", " "),
    }),
    { parse_mode: "HTML", reply_markup: back }
  );
});

bot.callbackQuery("menu:help", async (ctx) => {
  const lang = await getLang(ctx);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t(lang, "help_text"), {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text(t(lang, "btn_back"), "menu:main"),
  });
});

bot.command("buttons", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  await ctx.reply(
    "🛠 <b>Button Editor</b>\n\nKetik key tombol yang mau diubah:\n• btn_plans\n• btn_status\n• btn_help\n• btn_language\n• btn_back\n\nContoh:\n<code>btn_plans</code>",
    { parse_mode: "HTML" }
  );
  if (!ctx.session) return;
  ctx.session.awaitingButtonEdit = { key: "" };
});

async function doBroadcast(ctx: BotContext): Promise<boolean> {
  if (!ctx.session.awaitingBroadcast) return false;
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return false;

  ctx.session.awaitingBroadcast = false;
  const allUsers = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
  const total = allUsers.length;
  const statusMsg = await ctx.reply(`📤 Mengirim broadcast ke ${total} user...`);

  let sent = 0, failed = 0;
  for (const user of allUsers) {
    try {
      await ctx.api.copyMessage(Number(user.telegramId), ctx.chat.id, ctx.message!.message_id);
      sent++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ <b>Broadcast selesai!</b>\n\n📨 Terkirim: <b>${sent}</b>\n❌ Gagal: <b>${failed}</b>\n👥 Total: <b>${total}</b>`,
      { parse_mode: "HTML" }
    );
  } catch {}
  return true;
}

bot.on("message:text", async (ctx, next) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return next();
  if (await doBroadcast(ctx)) return;
  const pending = ctx.session.awaitingButtonEdit;
  if (!pending) return next();
  const text = ctx.message.text.trim();
  if (!pending.key) {
    if (!["btn_plans", "btn_status", "btn_help", "btn_language", "btn_back"].includes(text)) {
      await ctx.reply("❌ Key tidak valid.");
      return;
    }
    pending.key = text;
    await ctx.reply("Sekarang kirim label barunya.");
    return;
  }
  const key = pending.key;
  await ctx.reply(`✅ Dicatat: <code>${key}</code> → <b>${text}</b>`, { parse_mode: "HTML" });
  ctx.session.awaitingButtonEdit = null;
});

bot.on("message:video", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  await doBroadcast(ctx);
});

bot.on("message:photo", async (ctx) => {
  if (!ctx.from) return;
  if (ctx.from.id === ADMIN_ID && await doBroadcast(ctx)) return;
  const pending = ctx.session.awaitingProofFor;
  const lang = await getLang(ctx);
  if (!pending) return;
  const plan = findPlanById(pending.planId);
  if (!plan) return;

  const photo = ctx.message.photo[ctx.message.photo.length - 1]!;
  const inserted = await db
    .insert(paymentProofsTable)
    .values({
      telegramId: ctx.from.id,
      username: ctx.from.username ?? null,
      planId: plan.id,
      region: plan.region,
      method: pending.method,
      fileId: photo.file_id,
      caption: ctx.message.caption ?? null,
      status: "pending",
    })
    .returning();
  const proof = inserted[0]!;
  ctx.session.awaitingProofFor = null;

  await ctx.reply(t(lang, "proof_received"), { parse_mode: "HTML" });

  const userFullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
  const userLink = ctx.from.username
    ? `<a href="https://t.me/${ctx.from.username}">@${ctx.from.username}</a>`
    : `<a href="tg://user?id=${ctx.from.id}">${userFullName || ctx.from.id}</a>`;
  const proofTime = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const adminCaption =
    `🧾 <b>Payment Proof #${proof.id}</b>\n` +
    `${"─".repeat(28)}\n` +
    `👤 User: ${userLink} (ID: <code>${ctx.from.id}</code>)\n` +
    `📛 Name: ${userFullName || "(no name)"}\n` +
    `📦 Plan: <b>${plan.id}</b>\n` +
    `💰 Amount: <b>${plan.price}</b>\n` +
    `💳 Method: <b>${pending.method}</b>\n` +
    `🌍 Region: ${plan.region.toUpperCase()}\n` +
    `🗣 Language: ${lang}\n` +
    `🕐 Time: ${proofTime}\n` +
    `${"─".repeat(28)}\n` +
    `✅ Approve atau ❌ Reject di bawah:`;
  const adminKb = new InlineKeyboard()
    .text("✅ Approve", `admin:approve:${proof.id}`)
    .text("❌ Reject", `admin:reject:${proof.id}`);
  try {
    const sent = await bot.api.sendPhoto(ADMIN_ID, photo.file_id, {
      caption: adminCaption,
      parse_mode: "HTML",
      reply_markup: adminKb,
    });
    await db
      .update(paymentProofsTable)
      .set({ adminMessageId: sent.message_id })
      .where(eq(paymentProofsTable.id, proof.id));
  } catch (err) {
    logger.error({ err }, "Failed to forward proof to admin");
  }
});

bot.callbackQuery(/^admin:(approve|reject):(\d+)$/, async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) {
    return ctx.answerCallbackQuery("Not authorized");
  }
  const action = ctx.match![1] as "approve" | "reject";
  const proofId = Number(ctx.match![2]);
  const proofs = await db.select().from(paymentProofsTable).where(eq(paymentProofsTable.id, proofId)).limit(1);
  const proof = proofs[0];
  if (!proof) return ctx.answerCallbackQuery("Proof not found");
  if (proof.status !== "pending") return ctx.answerCallbackQuery(`Already ${proof.status}`);

  const userLangResult = await db.select().from(usersTable).where(eq(usersTable.telegramId, proof.telegramId)).limit(1);
  const userLang = (userLangResult[0]?.language as Lang) ?? "id";
  const plan = findPlanById(proof.planId);

  if (action === "reject") {
    await db
      .update(paymentProofsTable)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(eq(paymentProofsTable.id, proofId));
    await ctx.answerCallbackQuery("Rejected");
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message?.caption ?? "") + "\n\n❌ <b>REJECTED</b>",
      parse_mode: "HTML",
    });
    try {
      await bot.api.sendMessage(Number(proof.telegramId), t(userLang, "rejected_user"), {
        parse_mode: "HTML",
      });
    } catch (err) {
      logger.error({ err }, "Failed to notify rejected user");
    }
    return;
  }

  if (!plan) return ctx.answerCallbackQuery("Plan not found");

  const startedAt = new Date();
  const expiresAt = plan.durationDays
    ? new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    : null;

  await db.insert(subscriptionsTable).values({
    telegramId: proof.telegramId,
    planId: plan.id,
    region: plan.region,
    status: "active",
    startedAt,
    expiresAt,
  });
  await db
    .update(paymentProofsTable)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(paymentProofsTable.id, proofId));

  let inviteLink = "";
  try {
    const expireUnix = expiresAt
      ? Math.floor(expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 86400 * 365 * 10;
    const link = await bot.api.createChatInviteLink(channelIdParsed, {
      member_limit: 1,
      expire_date: expireUnix,
      name: `Sub #${proof.id}`,
    });
    inviteLink = link.invite_link;
  } catch (err) {
    logger.error({ err }, "Failed to create invite link");
    inviteLink = "(admin will send invite link manually)";
  }

  const planName =
    plan.key === "weekly"
      ? t(userLang, "plan_weekly")
      : plan.key === "monthly"
        ? t(userLang, "plan_monthly")
        : t(userLang, "plan_permanent");

  try {
    if (expiresAt) {
      await bot.api.sendMessage(
        Number(proof.telegramId),
        t(userLang, "approved_user", {
          plan: planName,
          expires: expiresAt.toISOString().slice(0, 16).replace("T", " "),
          invite: inviteLink,
        }),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } else {
      await bot.api.sendMessage(
        Number(proof.telegramId),
        t(userLang, "approved_user_permanent", { plan: planName, invite: inviteLink }),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to notify approved user");
  }

  let bonusInvite: string | null = null;
  if (isBonusEligible(plan.key)) {
    bonusInvite = await createBonusInviteLink(expiresAt, proof.id);
    if (bonusInvite) {
      try {
        const bonusMsg =
          userLang === "id"
            ? `🎁 <b>Bonus channel akses!</b>\n\nKamu juga dapet akses ke channel bonus karena upgrade ke plan ${planName}:\n\n🔗 ${bonusInvite}\n\n<i>Link ini single-use & akan expired bareng subscription kamu.</i>`
            : userLang === "my"
              ? `🎁 <b>Akses saluran bonus!</b>\n\nAnda juga mendapat akses ke saluran bonus kerana menaik taraf ke pakej ${planName}:\n\n🔗 ${bonusInvite}\n\n<i>Pautan ini satu kali guna & akan tamat bersama langganan anda.</i>`
              : userLang === "ar"
                ? `🎁 <b>قناة المكافأة!</b>\n\nلقد حصلت على وصول إلى قناة المكافأة لأنك ترقيت إلى خطة ${planName} عبر QRIS:\n\n🔗 ${bonusInvite}\n\n<i>هذا الرابط للاستخدام مرة واحدة وسينتهي مع اشتراكك.</i>`
                : `🎁 <b>Bonus channel access!</b>\n\nYou also get access to the bonus channel for upgrading to the ${planName} plan via QRIS:\n\n🔗 ${bonusInvite}\n\n<i>This link is single-use and will expire with your subscription.</i>`;
        await bot.api.sendMessage(Number(proof.telegramId), bonusMsg, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        logger.error({ err }, "Failed to send bonus invite to user");
      }
    }
  }

  try { await ctx.answerCallbackQuery("Approved"); } catch (_) {}
  const bonusLine = bonusInvite ? `\n🎁 Bonus: ${bonusInvite}` : "";
  try {
    await ctx.editMessageCaption({
      caption: (ctx.callbackQuery.message?.caption ?? "") + `\n\n✅ <b>APPROVED</b>\n🔗 ${inviteLink}${bonusLine}`,
      parse_mode: "HTML",
    });
  } catch (_) {}

  // Sync to Google Sheet
  appendSubscriberRow({
    telegramId: Number(proof.telegramId),
    username: proof.username,
    planId: plan.id,
    region: plan.region,
    status: "active",
    startedAt,
    expiresAt,
    method: proof.method,
  }).catch(() => {});
  appendPaymentRow({
    id: proof.id,
    telegramId: Number(proof.telegramId),
    username: proof.username,
    planId: proof.planId,
    method: proof.method,
    status: "approved",
    createdAt: proof.createdAt,
    reviewedAt: new Date(),
  }).catch(() => {});
});

bot.command("syncsheet", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  const sheetId = process.env["GOOGLE_SHEET_ID"];
  if (!sheetId) {
    await ctx.reply("❌ GOOGLE_SHEET_ID belum diset.");
    return;
  }
  await ctx.reply("⏳ Sedang sync semua data ke Google Sheet...");

  const [subs, payments, allUsers] = await Promise.all([
    db.select().from(subscriptionsTable).orderBy(desc(subscriptionsTable.startedAt)),
    db.select().from(paymentProofsTable).orderBy(desc(paymentProofsTable.createdAt)),
    db.select().from(usersTable).orderBy(desc(usersTable.createdAt)),
  ]);

  const userMap = new Map<number, string | null>();
  for (const u of allUsers) userMap.set(u.telegramId, u.username);

  await Promise.all([
    syncUsersToSheet(allUsers.map(u => ({
      telegramId: Number(u.telegramId),
      username: u.username,
      firstName: u.firstName,
      language: u.language,
      region: u.region,
      createdAt: u.createdAt,
    }))),
    syncSubscribersToSheet(subs.map(s => ({
      telegramId: Number(s.telegramId),
      username: userMap.get(Number(s.telegramId)) ?? null,
      planId: s.planId,
      region: s.region,
      status: s.status,
      startedAt: s.startedAt,
      expiresAt: s.expiresAt ?? null,
    }))),
    syncPaymentsToSheet(payments.map(p => ({
      id: p.id,
      telegramId: Number(p.telegramId),
      username: p.username,
      planId: p.planId,
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
      reviewedAt: p.reviewedAt ?? null,
    }))),
  ]);

  await ctx.reply(
    `✅ <b>Sync selesai!</b>\n\n` +
    `👥 Total Users: ${allUsers.length} baris\n` +
    `📋 Subscribers: ${subs.length} baris\n` +
    `💳 Payments: ${payments.length} baris\n\n` +
    `🔗 https://docs.google.com/spreadsheets/d/${sheetId}`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
  );
});

bot.command("stats", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

  const totalUsers = await db.select({ c: sql<number>`count(*)::int` }).from(usersTable);
  const activeSubs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        or(isNull(subscriptionsTable.expiresAt), gt(subscriptionsTable.expiresAt, new Date()))
      )
    );
  const pendingProofs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(paymentProofsTable)
    .where(eq(paymentProofsTable.status, "pending"));

  const byPlan = await db
    .select({
      planId: subscriptionsTable.planId,
      c: sql<number>`count(*)::int`,
    })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        or(isNull(subscriptionsTable.expiresAt), gt(subscriptionsTable.expiresAt, new Date()))
      )
    )
    .groupBy(subscriptionsTable.planId);

  const planLines = byPlan.length
    ? byPlan.map((r) => `  • <code>${r.planId}</code>: ${r.c}`).join("\n")
    : "  <i>(none)</i>";

  const recentPending = await db
    .select()
    .from(paymentProofsTable)
    .where(eq(paymentProofsTable.status, "pending"))
    .orderBy(desc(paymentProofsTable.createdAt))
    .limit(5);

  const pendingLines = recentPending.length
    ? recentPending
        .map(
          (p) =>
            `  • #${p.id} — ${p.username ? "@" + p.username : p.telegramId} — <code>${p.planId}</code> (${p.method})`
        )
        .join("\n")
    : "  <i>(none)</i>";

  await ctx.reply(
    `📊 <b>Bot Stats</b>\n\n` +
      `👥 Total users: <b>${totalUsers[0]?.c ?? 0}</b>\n` +
      `✅ Active subscriptions: <b>${activeSubs[0]?.c ?? 0}</b>\n` +
      `⏳ Pending payment proofs: <b>${pendingProofs[0]?.c ?? 0}</b>\n\n` +
      `<b>Active by plan:</b>\n${planLines}\n\n` +
      `<b>Recent pending proofs:</b>\n${pendingLines}`,
    { parse_mode: "HTML" }
  );
});

bot.command("check_channel", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  const lines: string[] = [`🔎 <b>Channel Setup Check</b>\n\nChannel ID: <code>${CHANNEL_ID}</code>`];
  try {
    const chat = await bot.api.getChat(channelIdParsed);
    lines.push(`✅ Channel reachable: <b>${"title" in chat ? chat.title : chat.id}</b>`);
    lines.push(`   Type: ${chat.type}`);
  } catch (err) {
    lines.push(`❌ Cannot access channel. Make sure the bot is a member/admin and the ID is correct.`);
    lines.push(`   Error: <code>${(err as Error).message}</code>`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    return;
  }
  try {
    const me = await bot.api.getMe();
    const member = await bot.api.getChatMember(channelIdParsed, me.id);
    lines.push(`\n👤 Bot status in channel: <b>${member.status}</b>`);
    if (member.status === "administrator") {
      const canInvite = member.can_invite_users ? "✅" : "❌";
      const canBan = member.can_restrict_members ? "✅" : "❌";
      lines.push(`   ${canInvite} Invite Users via Link`);
      lines.push(`   ${canBan} Ban / Restrict Users`);
      if (member.can_invite_users && member.can_restrict_members) {
        lines.push(`\n🎉 <b>All good! Bot is ready to handle subscriptions.</b>`);
      } else {
        lines.push(`\n⚠️ Missing permissions above. Edit admin rights in channel settings.`);
      }
    } else {
      lines.push(`\n⚠️ Bot is NOT an admin. Add the bot as admin with "Invite Users via Link" + "Ban Users" permissions.`);
    }
  } catch (err) {
    lines.push(`\n❌ Could not check bot's permissions: <code>${(err as Error).message}</code>`);
  }
  try {
    const link = await bot.api.createChatInviteLink(channelIdParsed, {
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 300,
      name: "Test link",
    });
    lines.push(`\n🔗 Test invite link generated successfully (expires in 5 min):\n${link.invite_link}`);
  } catch (err) {
    lines.push(`\n❌ Could not generate test invite link: <code>${(err as Error).message}</code>`);
  }

  lines.push(`\n\n━━━━━━━━━━━━━━━\n🎁 <b>Bonus Channel Check</b>\nID: <code>${BONUS_CHANNEL_ID}</code>`);
  try {
    const bChat = await bot.api.getChat(BONUS_CHANNEL_ID);
    lines.push(`✅ Bonus channel reachable: <b>${"title" in bChat ? bChat.title : bChat.id}</b>`);
    const me = await bot.api.getMe();
    const bMember = await bot.api.getChatMember(BONUS_CHANNEL_ID, me.id);
    lines.push(`👤 Bot status: <b>${bMember.status}</b>`);
    if (bMember.status === "administrator") {
      const ci = bMember.can_invite_users ? "✅" : "❌";
      const cb = bMember.can_restrict_members ? "✅" : "❌";
      lines.push(`   ${ci} Invite Users via Link\n   ${cb} Ban / Restrict Users`);
    }
    const bLink = await bot.api.createChatInviteLink(BONUS_CHANNEL_ID, {
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 300,
      name: "Bonus test",
    });
    lines.push(`🔗 Bonus test link: ${bLink.invite_link}`);
  } catch (err) {
    lines.push(`❌ Bonus channel error: <code>${(err as Error).message}</code>`);
    lines.push(`   Add the bot as admin in the bonus channel with the same permissions.`);
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
});

bot.command("expire_check", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  const count = await runExpiryCheck();
  await ctx.reply(`Expiry check done. ${count} subscription(s) expired & users kicked.`);
});

bot.command("broadcast", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  ctx.session.awaitingBroadcast = true;
  await ctx.reply(
    `📢 <b>Mode Broadcast Aktif</b>\n\n` +
    `Kirim pesan yang ingin kamu broadcast ke semua user.\n` +
    `Bisa teks, foto, atau video.\n\n` +
    `Ketik /cancelbroadcast untuk batal.`,
    { parse_mode: "HTML" }
  );
});

bot.command("cancelbroadcast", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;
  ctx.session.awaitingBroadcast = false;
  await ctx.reply("❌ Broadcast dibatalkan.");
});

export async function runExpiryCheck(): Promise<number> {
  const now = new Date();
  const expiring = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "active"));
  let count = 0;
  for (const sub of expiring) {
    if (!sub.expiresAt) continue;
    if (sub.expiresAt > now) continue;
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(eq(subscriptionsTable.id, sub.id));
    count++;
    try {
      await bot.api.banChatMember(channelIdParsed, Number(sub.telegramId));
      await bot.api.unbanChatMember(channelIdParsed, Number(sub.telegramId));
    } catch (err) {
      logger.error({ err, userId: sub.telegramId }, "Failed to kick expired user");
    }
    try {
      await bot.api.banChatMember(BONUS_CHANNEL_ID, Number(sub.telegramId));
      await bot.api.unbanChatMember(BONUS_CHANNEL_ID, Number(sub.telegramId));
    } catch (err) {
      logger.warn({ err, userId: sub.telegramId }, "Bonus channel kick skipped (user may not be a member)");
    }
    const userLangResult = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, sub.telegramId))
      .limit(1);
    const userLang = (userLangResult[0]?.language as Lang) ?? "id";
    try {
      await bot.api.sendMessage(Number(sub.telegramId), t(userLang, "expired_kicked"), {
        parse_mode: "HTML",
      });
    } catch (err) {
      logger.error({ err }, "Failed to notify expired user");
    }
  }
  return count;
}

bot.command("adduser", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

  const args = ctx.match?.trim().split(/\s+/) ?? [];
  const usage = `Penggunaan:\n<code>/adduser &lt;telegram_id&gt; &lt;region&gt; &lt;plan&gt;</code>\n\nRegion: <b>id</b> / <b>my</b> / <b>intl</b>\nPlan: <b>weekly</b> / <b>monthly</b> / <b>permanent</b>\n\nContoh:\n<code>/adduser 123456789 id monthly</code>`;

  if (args.length < 3) {
    await ctx.reply(usage, { parse_mode: "HTML" });
    return;
  }

  const [telegramIdStr, regionStr, planKeyStr] = args;
  const telegramId = Number(telegramIdStr);

  if (isNaN(telegramId) || telegramId <= 0) {
    await ctx.reply("❌ Telegram ID tidak valid. Harus berupa angka.\n\n" + usage, { parse_mode: "HTML" });
    return;
  }

  const validRegions = ["id", "my", "intl"];
  const validPlans = ["weekly", "monthly", "permanent"];

  if (!validRegions.includes(regionStr!)) {
    await ctx.reply(`❌ Region tidak valid: <b>${regionStr}</b>\nPilih: id / my / intl\n\n${usage}`, { parse_mode: "HTML" });
    return;
  }
  if (!validPlans.includes(planKeyStr!)) {
    await ctx.reply(`❌ Plan tidak valid: <b>${planKeyStr}</b>\nPilih: weekly / monthly / permanent\n\n${usage}`, { parse_mode: "HTML" });
    return;
  }

  const region = regionStr as Region;
  const planKey = planKeyStr as PlanKey;
  const plan = PLANS[region][planKey];

  const startedAt = new Date();
  const expiresAt = plan.durationDays
    ? new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    : null;

  await db
    .insert(usersTable)
    .values({ telegramId, language: region === "intl" ? "en" : "id", region })
    .onConflictDoNothing();

  const existing = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.telegramId, telegramId), eq(subscriptionsTable.status, "active")))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptionsTable)
      .set({ status: "replaced" })
      .where(eq(subscriptionsTable.id, existing[0]!.id));
  }

  await db.insert(subscriptionsTable).values({
    telegramId,
    planId: plan.id,
    region: plan.region,
    status: "active",
    startedAt,
    expiresAt,
  });

  let inviteLink = "";
  try {
    const expireUnix = expiresAt
      ? Math.floor(expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 86400 * 365 * 10;
    const link = await bot.api.createChatInviteLink(channelIdParsed, {
      member_limit: 1,
      expire_date: expireUnix,
      name: `Manual #${telegramId}`,
    });
    inviteLink = link.invite_link;
  } catch (err) {
    logger.error({ err }, "Failed to create invite link for manual adduser");
    inviteLink = "(gagal buat link — pastikan bot adalah admin channel)";
  }

  let bonusLine = "";
  if (isBonusEligible(planKey)) {
    const bonusInvite = await createBonusInviteLink(expiresAt, telegramId);
    if (bonusInvite) bonusLine = `\n🎁 <b>Bonus link:</b> ${bonusInvite}`;
  }

  const expiresStr = expiresAt
    ? expiresAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"
    : "Selamanya ♾";

  const summary =
    `✅ <b>User berhasil didaftarkan!</b>\n\n` +
    `🆔 Telegram ID: <code>${telegramId}</code>\n` +
    `📦 Plan: <b>${plan.id}</b> (${plan.price})\n` +
    `⏰ Berlaku: <b>${expiresStr}</b>\n` +
    `🔗 Invite link: ${inviteLink}${bonusLine}\n\n` +
    `<i>Kirim link ini ke user secara manual.</i>`;

  await ctx.reply(summary, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
});

bot.command("listusers", async (ctx) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "active"))
    .orderBy(desc(subscriptionsTable.startedAt));

  if (subs.length === 0) {
    await ctx.reply("Belum ada subscriber aktif.");
    return;
  }

  const lines = [`👥 <b>Active Subscribers (${subs.length})</b>\n`];
  for (const sub of subs) {
    const exp = sub.expiresAt
      ? sub.expiresAt.toISOString().slice(0, 10)
      : "♾ Permanent";
    lines.push(`• <code>${sub.telegramId}</code> — <b>${sub.planId}</b> — exp: ${exp}`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
});

bot.catch((err) => {
  const e = err.error as any;
  // Abaikan error "message is not modified" — terjadi saat user klik tombol yang sama berulang
  if (e?.error_code === 400 && e?.description?.includes("message is not modified")) return;
  // Abaikan error "message to edit not found" — terjadi saat pesan sudah dihapus
  if (e?.error_code === 400 && e?.description?.includes("message to edit not found")) return;
  // Abaikan error "query is too old" — callback query sudah expired
  if (e?.error_code === 400 && e?.description?.includes("query is too old")) return;
  logger.error({ err: e }, "Bot error");
});

export function startBot() {
  bot.start({
    onStart: (info) => logger.info({ username: info.username }, "Telegram bot started"),
  }).catch((err) => logger.error({ err }, "Bot failed to start"));

  setInterval(() => {
    runExpiryCheck().catch((err) => logger.error({ err }, "Expiry check failed"));
  }, 60 * 60 * 1000);
}
