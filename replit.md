# Payment Gateway Bot (Innominata Bot)

## Overview
Bot Telegram untuk subscription channel berbayar. User bisa pilih paket, bayar via QRIS/PayPal, upload bukti transfer, lalu admin approve/reject. Setelah approve, bot otomatis kirim invite link ke channel.

## Tech Stack
- **Runtime**: Node.js 22
- **Framework**: Express 5 + GrammY (Telegram bot)
- **Database**: PostgreSQL (Drizzle ORM)
- **Build**: esbuild (monorepo dengan pnpm workspace)
- **Language**: TypeScript

## Struktur Proyek
```
artifacts/api-server/     # Server utama & bot Telegram
  src/
    index.ts              # Entry point (Express + bot starter)
    app.ts                # Express app setup
    bot/
      index.ts            # Logika bot Telegram lengkap
      plans.ts            # Konfigurasi paket & harga
      i18n.ts             # Terjemahan (id/en/zh/ar)
    routes/               # API routes (healthz)
    lib/logger.ts         # Pino logger
  assets/
    qris.png              # QR code pembayaran
    intro.mp4             # Video intro bot
  dist/                   # Output build (jangan diedit)

lib/
  db/                     # Drizzle schema & koneksi PostgreSQL
  api-zod/                # Zod schemas
  api-client-react/       # React API client
```

## Environment Variables (Wajib)
- `TELEGRAM_BOT_TOKEN` — Token dari @BotFather
- `TELEGRAM_ADMIN_ID` — User ID admin Telegram
- `TELEGRAM_CHANNEL_ID` — ID channel yang dikelola (format: -100xxxxxxxxxx)
- `DATABASE_URL` — PostgreSQL connection string (auto dari Replit DB)
- `PORT` — Port server (default 5000)

## Fitur Bot
- **Multi-bahasa**: Indonesia, English, 中文, العربية
- **Multi-region**: Indonesia (IDR), Malaysia (MYR), International (USD)
- **Paket**: Weekly / Monthly / Permanent
- **Pembayaran**: QRIS (ID/MY), PayPal (Intl)
- **Bonus channel**: Otomatis untuk paket Monthly & Permanent
- **Auto-kick**: User dikeluarkan channel saat langganan expired
- **Admin commands**: `/stats`, `/check_channel`, `/expire_check`

## Database Tables
- `users` — Data user Telegram
- `subscriptions` — Riwayat langganan aktif/expired
- `payment_proofs` — Bukti pembayaran (pending/approved/rejected)

## Cara Jalankan
```bash
pnpm install --filter @workspace/api-server...
pnpm --filter @workspace/api-server run build
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

## Deployment
Autoscale deployment:
```
node --enable-source-maps artifacts/api-server/dist/index.mjs
```
