import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot";
import { pool } from "@workspace/db";

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        telegram_id bigint NOT NULL PRIMARY KEY,
        username text,
        first_name text,
        language varchar(4) NOT NULL DEFAULT 'id',
        region varchar(8) NOT NULL DEFAULT 'id',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE SEQUENCE IF NOT EXISTS public.payment_proofs_id_seq
        AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
      CREATE TABLE IF NOT EXISTS public.payment_proofs (
        id integer NOT NULL DEFAULT nextval('public.payment_proofs_id_seq'::regclass) PRIMARY KEY,
        telegram_id bigint NOT NULL,
        username text,
        plan_id text NOT NULL,
        region varchar(8) NOT NULL,
        method varchar(64) NOT NULL,
        file_id text,
        caption text,
        status varchar(16) NOT NULL DEFAULT 'pending',
        admin_message_id bigint,
        created_at timestamp NOT NULL DEFAULT now(),
        reviewed_at timestamp
      );

      CREATE SEQUENCE IF NOT EXISTS public.subscriptions_id_seq
        AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
      CREATE TABLE IF NOT EXISTS public.subscriptions (
        id integer NOT NULL DEFAULT nextval('public.subscriptions_id_seq'::regclass) PRIMARY KEY,
        telegram_id bigint NOT NULL,
        plan_id text NOT NULL,
        region varchar(8) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        started_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.bot_sessions (
        key text NOT NULL PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
    logger.info("Database schema ready");
  } finally {
    client.release();
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initDatabase()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      if (process.env["START_BOT"] === "true") {
        startBot();
      } else {
        logger.info("Bot not started (START_BOT != true) — development mode");
      }
    });
  })
  .catch((err) => {
    logger.error({ err }, "Database initialization failed");
    process.exit(1);
  });
