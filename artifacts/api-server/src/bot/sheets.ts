// Google Sheets sync via Replit Connectors SDK (google-sheet)
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

const SHEET_ID = process.env["GOOGLE_SHEET_ID"];

async function sheetsRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  if (!SHEET_ID) {
    logger.warn("GOOGLE_SHEET_ID not set — Google Sheets sync disabled");
    return null;
  }
  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy("google-sheet", path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    } as any);
    return await (res as any).json();
  } catch (err) {
    logger.error({ err }, "Google Sheets request failed");
    return null;
  }
}

async function sheetsUpdate(range: string, values: string[][]): Promise<void> {
  if (!SHEET_ID) return;
  await sheetsRequest(
    "PUT",
    `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { values }
  );
}

async function sheetsAppend(range: string, values: string[][]): Promise<void> {
  if (!SHEET_ID) return;
  await sheetsRequest(
    "POST",
    `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values }
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function syncUsersToSheet(rows: {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  language: string;
  region: string;
  createdAt: Date;
}[]): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsUpdate("Users!A2:F", rows.map(r => [
      r.telegramId.toString(),
      r.username ?? "",
      r.firstName ?? "",
      r.language,
      r.region,
      r.createdAt.toISOString().slice(0, 16).replace("T", " "),
    ]));
    logger.info({ count: rows.length }, "Users synced to Google Sheet");
  } catch (err) {
    logger.error({ err }, "Failed to sync users to Google Sheet");
  }
}

export async function appendUserRow(row: {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  language: string;
  region: string;
  createdAt: Date;
}): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsAppend("Users!A:F", [[
      row.telegramId.toString(),
      row.username ?? "",
      row.firstName ?? "",
      row.language,
      row.region,
      row.createdAt.toISOString().slice(0, 16).replace("T", " "),
    ]]);
  } catch (err) {
    logger.error({ err }, "Failed to append user row to sheet");
  }
}

// ─── Subscribers ──────────────────────────────────────────────────────────────

export async function syncSubscribersToSheet(rows: {
  telegramId: number;
  username: string | null;
  planId: string;
  region: string;
  status: string;
  startedAt: Date;
  expiresAt: Date | null;
  method?: string;
}[]): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsUpdate("Subscribers!A2:H", rows.map(r => [
      r.telegramId.toString(),
      r.username ?? "",
      r.planId,
      r.region,
      r.status,
      r.startedAt.toISOString().slice(0, 16).replace("T", " "),
      r.expiresAt ? r.expiresAt.toISOString().slice(0, 16).replace("T", " ") : "Permanent",
      r.method ?? "",
    ]));
    logger.info({ count: rows.length }, "Subscribers synced to Google Sheet");
  } catch (err) {
    logger.error({ err }, "Failed to sync subscribers to Google Sheet");
  }
}

export async function appendSubscriberRow(row: {
  telegramId: number;
  username: string | null;
  planId: string;
  region: string;
  status: string;
  startedAt: Date;
  expiresAt: Date | null;
  method?: string;
}): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsAppend("Subscribers!A:H", [[
      row.telegramId.toString(),
      row.username ?? "",
      row.planId,
      row.region,
      row.status,
      row.startedAt.toISOString().slice(0, 16).replace("T", " "),
      row.expiresAt ? row.expiresAt.toISOString().slice(0, 16).replace("T", " ") : "Permanent",
      row.method ?? "",
    ]]);
  } catch (err) {
    logger.error({ err }, "Failed to append subscriber row to sheet");
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function syncPaymentsToSheet(rows: {
  id: number;
  telegramId: number;
  username: string | null;
  planId: string;
  method: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
}[]): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsUpdate("Payments!A2:H", rows.map(r => [
      r.id.toString(),
      r.telegramId.toString(),
      r.username ?? "",
      r.planId,
      r.method,
      r.status,
      r.createdAt.toISOString().slice(0, 16).replace("T", " "),
      r.reviewedAt ? r.reviewedAt.toISOString().slice(0, 16).replace("T", " ") : "",
    ]));
    logger.info({ count: rows.length }, "Payments synced to Google Sheet");
  } catch (err) {
    logger.error({ err }, "Failed to sync payments to Google Sheet");
  }
}

export async function appendPaymentRow(row: {
  id: number;
  telegramId: number;
  username: string | null;
  planId: string;
  method: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
}): Promise<void> {
  if (!SHEET_ID) return;
  try {
    await sheetsAppend("Payments!A:H", [[
      row.id.toString(),
      row.telegramId.toString(),
      row.username ?? "",
      row.planId,
      row.method,
      row.status,
      row.createdAt.toISOString().slice(0, 16).replace("T", " "),
      row.reviewedAt ? row.reviewedAt.toISOString().slice(0, 16).replace("T", " ") : "",
    ]]);
  } catch (err) {
    logger.error({ err }, "Failed to append payment row to sheet");
  }
}
