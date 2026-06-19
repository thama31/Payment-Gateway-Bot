export type Lang = "id" | "en" | "my" | "ar";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "my", label: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

type Dict = Record<string, string>;

const id: Dict = {
  choose_language: "Selamat datang! Silakan pilih bahasa:",
  language_set: "Bahasa diatur ke Bahasa Indonesia.",
  main_menu: "🌟 <b>Menu Utama</b>\n\nPilih opsi di bawah:",
  btn_plans: "💎 Paket Langganan",
  btn_status: "📊 Status Langganan",
  btn_help: "❓ Bantuan & Dukungan",
  btn_language: "🌐 Ubah Bahasa",
  btn_back: "« Kembali",
  choose_region: "Pilih wilayah/mata uang:",
  region_id: "🇮🇩 Indonesia (IDR)",
  region_my: "🇲🇾 Malaysia (MYR)",
  region_intl: "🌍 International (USD)",
  plans_title: "💎 <b>Paket Langganan</b>\n\nPilih paket yang kamu mau:",
  plan_weekly: "Mingguan",
  plan_monthly: "Bulanan",
  plan_permanent: "Permanen",
  plan_detail:
    "📦 <b>Paket {plan}</b>\n💰 Harga: <b>{price}</b>\n⏱ Durasi: <b>{duration}</b>\n\nPilih metode pembayaran:",
  duration_days: "{days} hari",
  duration_permanent: "Akses selamanya",
  payment_instruction:
    "💳 <b>{method}</b>\n\n{details}\n\n📦 Paket: <b>{plan}</b>\n💰 Total: <b>{price}</b>\n\n📸 Setelah transfer, <b>kirim screenshot bukti transfer</b> ke chat ini. Admin akan verifikasi & aktifkan langganan kamu.",
  awaiting_proof:
    "⏳ Silakan kirim <b>foto bukti pembayaran</b> sekarang untuk paket {plan} ({price}) via {method}.",
  proof_received:
    "✅ Bukti pembayaran diterima!\n\nAdmin akan memverifikasi & mengaktifkan langganan kamu segera. Mohon tunggu.",
  status_active:
    "✅ <b>Langganan Aktif</b>\n\n📦 Paket: <b>{plan}</b>\n📅 Mulai: {started}\n⏰ Berakhir: <b>{expires}</b>",
  status_permanent:
    "✅ <b>Langganan Aktif (Permanen)</b>\n\n📦 Paket: <b>{plan}</b>\n📅 Mulai: {started}\n♾ Akses selamanya",
  status_none: "❌ Kamu belum punya langganan aktif.\n\nGunakan tombol 💎 Paket Langganan untuk subscribe.",
  status_expired: "⚠️ Langganan kamu sudah berakhir.\n\nSilakan perpanjang lewat 💎 Paket Langganan.",
  help_text:
    "❓ <b>Bantuan & Dukungan</b>\n\nAda kendala pembayaran? Langsung chat admin:\n👤 @INNOMINATA666\n\n🕘 Admin aktif jam <b>09:00 - 23:00 WIB</b> (Waktu Jakarta).\n\n⚠️ <i>Admin hanya merespon pertanyaan seputar <b>pembayaran</b>. Pertanyaan di luar itu tidak akan direspon.</i>",
  approved_user:
    "🎉 <b>Pembayaran kamu sudah dikonfirmasi!</b>\n\n📦 Paket: <b>{plan}</b>\n⏰ Berlaku sampai: <b>{expires}</b>\n\nKlik link di bawah untuk gabung channel:\n{invite}",
  approved_user_permanent:
    "🎉 <b>Pembayaran kamu sudah dikonfirmasi!</b>\n\n📦 Paket: <b>{plan}</b>\n♾ Akses selamanya\n\nKlik link di bawah untuk gabung channel:\n{invite}",
  rejected_user:
    "❌ <b>Pembayaran kamu ditolak.</b>\n\nAlasan: bukti tidak valid atau jumlah tidak sesuai. Silakan hubungi admin lewat menu Bantuan.",
  expired_kicked:
    "⏰ Langganan kamu sudah berakhir & akses ke channel telah dicabut.\n\nUntuk perpanjang, gunakan menu 💎 Paket Langganan.",
};

const en: Dict = {
  choose_language: "Welcome! Please choose your language:",
  language_set: "Language set to English.",
  main_menu: "🌟 <b>Main Menu</b>\n\nChoose an option below:",
  btn_plans: "💎 Subscription Plans",
  btn_status: "📊 My Subscription",
  btn_help: "❓ Help & Support",
  btn_language: "🌐 Change Language",
  btn_back: "« Back",
  choose_region: "Choose your region/currency:",
  region_id: "🇮🇩 Indonesia (IDR)",
  region_my: "🇲🇾 Malaysia (MYR)",
  region_intl: "🌍 International (USD)",
  plans_title: "💎 <b>Subscription Plans</b>\n\nPick the plan you want:",
  plan_weekly: "Weekly",
  plan_monthly: "Monthly",
  plan_permanent: "Permanent",
  plan_detail:
    "📦 <b>{plan} Plan</b>\n💰 Price: <b>{price}</b>\n⏱ Duration: <b>{duration}</b>\n\nChoose a payment method:",
  duration_days: "{days} days",
  duration_permanent: "Lifetime access",
  payment_instruction:
    "💳 <b>{method}</b>\n\n{details}\n\n📦 Plan: <b>{plan}</b>\n💰 Total: <b>{price}</b>\n\n📸 After paying, <b>send a screenshot of the proof</b> to this chat. The admin will verify & activate your subscription.",
  awaiting_proof:
    "⏳ Please send the <b>payment proof photo</b> now for {plan} plan ({price}) via {method}.",
  proof_received:
    "✅ Payment proof received!\n\nThe admin will verify and activate your subscription shortly. Please wait.",
  status_active:
    "✅ <b>Active Subscription</b>\n\n📦 Plan: <b>{plan}</b>\n📅 Started: {started}\n⏰ Expires: <b>{expires}</b>",
  status_permanent:
    "✅ <b>Active Subscription (Permanent)</b>\n\n📦 Plan: <b>{plan}</b>\n📅 Started: {started}\n♾ Lifetime access",
  status_none: "❌ You don't have an active subscription.\n\nUse 💎 Subscription Plans to subscribe.",
  status_expired: "⚠️ Your subscription has expired.\n\nRenew via 💎 Subscription Plans.",
  help_text:
    "❓ <b>Help & Support</b>\n\nHaving payment issues? Message the admin:\n👤 @INNOMINATA666\n\n🕘 Admin is active <b>9 AM - 11 PM Jakarta time (GMT+7)</b>.\n\n⚠️ <i>Admin only responds to <b>payment-related</b> questions. Other inquiries will not be answered.</i>",
  approved_user:
    "🎉 <b>Your payment has been confirmed!</b>\n\n📦 Plan: <b>{plan}</b>\n⏰ Valid until: <b>{expires}</b>\n\nClick the link below to join the channel:\n{invite}",
  approved_user_permanent:
    "🎉 <b>Your payment has been confirmed!</b>\n\n📦 Plan: <b>{plan}</b>\n♾ Lifetime access\n\nClick the link below to join the channel:\n{invite}",
  rejected_user:
    "❌ <b>Your payment was rejected.</b>\n\nReason: invalid proof or wrong amount. Please contact admin via Help menu.",
  expired_kicked:
    "⏰ Your subscription has expired and channel access has been revoked.\n\nTo renew, use 💎 Subscription Plans.",
};

const my: Dict = {
  choose_language: "Selamat datang! Sila pilih bahasa anda:",
  language_set: "Bahasa ditetapkan ke Bahasa Melayu.",
  main_menu: "🌟 <b>Menu Utama</b>\n\nPilih pilihan di bawah:",
  btn_plans: "💎 Pakej Langganan",
  btn_status: "📊 Status Langganan",
  btn_help: "❓ Bantuan & Sokongan",
  btn_language: "🌐 Tukar Bahasa",
  btn_back: "« Kembali",
  choose_region: "Pilih kawasan/mata wang anda:",
  region_id: "🇮🇩 Indonesia (IDR)",
  region_my: "🇲🇾 Malaysia (MYR)",
  region_intl: "🌍 Antarabangsa (USD)",
  plans_title: "💎 <b>Pakej Langganan</b>\n\nPilih pakej yang anda mahu:",
  plan_weekly: "Mingguan",
  plan_monthly: "Bulanan",
  plan_permanent: "Kekal",
  plan_detail:
    "📦 <b>Pakej {plan}</b>\n💰 Harga: <b>{price}</b>\n⏱ Tempoh: <b>{duration}</b>\n\nPilih kaedah pembayaran:",
  duration_days: "{days} hari",
  duration_permanent: "Akses seumur hidup",
  payment_instruction:
    "💳 <b>{method}</b>\n\n{details}\n\n📦 Pakej: <b>{plan}</b>\n💰 Jumlah: <b>{price}</b>\n\n📸 Selepas bayar, <b>hantar tangkapan skrin bukti pembayaran</b> ke sembang ini. Admin akan mengesahkan & mengaktifkan langganan anda.",
  awaiting_proof:
    "⏳ Sila hantar <b>foto bukti pembayaran</b> sekarang untuk pakej {plan} ({price}) melalui {method}.",
  proof_received:
    "✅ Bukti pembayaran diterima!\n\nAdmin akan mengesahkan dan mengaktifkan langganan anda sebentar lagi. Sila tunggu.",
  status_active:
    "✅ <b>Langganan Aktif</b>\n\n📦 Pakej: <b>{plan}</b>\n📅 Mula: {started}\n⏰ Tamat: <b>{expires}</b>",
  status_permanent:
    "✅ <b>Langganan Aktif (Kekal)</b>\n\n📦 Pakej: <b>{plan}</b>\n📅 Mula: {started}\n♾ Akses seumur hidup",
  status_none: "❌ Anda tiada langganan aktif.\n\nGunakan 💎 Pakej Langganan untuk melanggan.",
  status_expired: "⚠️ Langganan anda telah tamat.\n\nRenew melalui 💎 Pakej Langganan.",
  help_text:
    "❓ <b>Bantuan & Sokongan</b>\n\nAda masalah pembayaran? Hubungi admin terus:\n👤 @INNOMINATA666\n\n🕘 Admin aktif <b>9 pagi - 11 malam Waktu Jakarta (GMT+7)</b>.\n\n⚠️ <i>Admin hanya menjawab soalan berkaitan <b>pembayaran</b> sahaja. Soalan lain tidak akan dilayan.</i>",
  approved_user:
    "🎉 <b>Pembayaran anda telah disahkan!</b>\n\n📦 Pakej: <b>{plan}</b>\n⏰ Sah sehingga: <b>{expires}</b>\n\nKlik pautan di bawah untuk sertai saluran:\n{invite}",
  approved_user_permanent:
    "🎉 <b>Pembayaran anda telah disahkan!</b>\n\n📦 Pakej: <b>{plan}</b>\n♾ Akses seumur hidup\n\nKlik pautan di bawah untuk sertai saluran:\n{invite}",
  rejected_user:
    "❌ <b>Pembayaran anda ditolak.</b>\n\nSebab: bukti tidak sah atau jumlah salah. Sila hubungi admin melalui menu Bantuan.",
  expired_kicked:
    "⏰ Langganan anda telah tamat & akses ke saluran telah dibatalkan.\n\nUntuk renew, gunakan 💎 Pakej Langganan.",
};

const ar: Dict = {
  choose_language: "مرحباً! يرجى اختيار اللغة:",
  language_set: "تم تعيين اللغة إلى العربية.",
  main_menu: "🌟 <b>القائمة الرئيسية</b>\n\nاختر أحد الخيارات أدناه:",
  btn_plans: "💎 خطط الاشتراك",
  btn_status: "📊 اشتراكي",
  btn_help: "❓ المساعدة والدعم",
  btn_language: "🌐 تغيير اللغة",
  btn_back: "« رجوع",
  choose_region: "اختر منطقتك/عملتك:",
  region_id: "🇮🇩 إندونيسيا (IDR)",
  region_my: "🇲🇾 ماليزيا (MYR)",
  region_intl: "🌍 دولي (USD)",
  plans_title: "💎 <b>خطط الاشتراك</b>\n\nاختر الخطة التي تريدها:",
  plan_weekly: "أسبوعي",
  plan_monthly: "شهري",
  plan_permanent: "دائم",
  plan_detail:
    "📦 <b>خطة {plan}</b>\n💰 السعر: <b>{price}</b>\n⏱ المدة: <b>{duration}</b>\n\nاختر طريقة الدفع:",
  duration_days: "{days} يوم",
  duration_permanent: "وصول دائم",
  payment_instruction:
    "💳 <b>{method}</b>\n\n{details}\n\n📦 الخطة: <b>{plan}</b>\n💰 المجموع: <b>{price}</b>\n\n📸 بعد الدفع، <b>أرسل لقطة شاشة لإثبات الدفع</b> في هذه المحادثة. سيقوم المسؤول بالتحقق وتفعيل اشتراكك.",
  awaiting_proof:
    "⏳ يرجى إرسال <b>صورة إثبات الدفع</b> الآن لخطة {plan} ({price}) عبر {method}.",
  proof_received:
    "✅ تم استلام إثبات الدفع!\n\nسيقوم المسؤول بالتحقق وتفعيل اشتراكك قريباً. يرجى الانتظار.",
  status_active:
    "✅ <b>اشتراك نشط</b>\n\n📦 الخطة: <b>{plan}</b>\n📅 بدأ: {started}\n⏰ ينتهي: <b>{expires}</b>",
  status_permanent:
    "✅ <b>اشتراك نشط (دائم)</b>\n\n📦 الخطة: <b>{plan}</b>\n📅 بدأ: {started}\n♾ وصول دائم",
  status_none: "❌ ليس لديك اشتراك نشط.\n\nاستخدم 💎 خطط الاشتراك للاشتراك.",
  status_expired: "⚠️ انتهى اشتراكك.\n\nجدد عبر 💎 خطط الاشتراك.",
  help_text:
    "❓ <b>المساعدة والدعم</b>\n\nهل لديك مشكلة في الدفع؟ تواصل مع المسؤول:\n👤 @INNOMINATA666\n\n🕘 المسؤول متاح من <b>9 صباحاً إلى 11 مساءً بتوقيت جاكرتا (GMT+7)</b>.\n\n⚠️ <i>المسؤول يرد فقط على أسئلة تتعلق <b>بالدفع</b>. لن يتم الرد على الاستفسارات الأخرى.</i>",
  approved_user:
    "🎉 <b>تم تأكيد دفعتك!</b>\n\n📦 الخطة: <b>{plan}</b>\n⏰ صالح حتى: <b>{expires}</b>\n\nانقر على الرابط أدناه للانضمام إلى القناة:\n{invite}",
  approved_user_permanent:
    "🎉 <b>تم تأكيد دفعتك!</b>\n\n📦 الخطة: <b>{plan}</b>\n♾ وصول دائم\n\nانقر على الرابط أدناه للانضمام إلى القناة:\n{invite}",
  rejected_user:
    "❌ <b>تم رفض دفعتك.</b>\n\nالسبب: إثبات غير صالح أو مبلغ خاطئ. يرجى التواصل مع المسؤول عبر قائمة المساعدة.",
  expired_kicked:
    "⏰ انتهى اشتراكك وتم إلغاء الوصول إلى القناة.\n\nللتجديد، استخدم 💎 خطط الاشتراك.",
};

const dicts: Record<Lang, Dict> = { id, en, my, ar };

export function t(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const dict = dicts[lang] ?? dicts.id;
  let str = dict[key] ?? id[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}
