import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

function isNeon() {
  return !!process.env.DATABASE_URL;
}

let sql = null;
if (isNeon()) {
  sql = neon(process.env.DATABASE_URL);
}

// ─── Local JSON Fallback Helpers ──────────────────────────────────────────────
const HISTORY_FILE = path.join(process.cwd(), "print-history.json");
const SETTINGS_FILE = path.join(process.cwd(), "app-settings.json");

function getLocalHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); } catch { return []; }
}
function saveLocalHistory(data) {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(data.slice(0, 100), null, 2)); } catch {}
}
function getLocalSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")); } catch { return {}; }
}
function saveLocalSettings(data) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

export default sql;

// ─── Schema initialisation ───────────────────────────────────────────────────
export async function initDb() {
  if (!sql) return { ok: true, fallback: true };
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS print_jobs (
        id           TEXT        PRIMARY KEY,
        product_name TEXT        NOT NULL,
        sku          TEXT        DEFAULT '',
        serial       TEXT        DEFAULT '',
        price        TEXT        DEFAULT '',
        copies       INTEGER     DEFAULT 1,
        printer_name TEXT        DEFAULT '',
        printer_type TEXT        DEFAULT 'usb',
        label_width  NUMERIC     DEFAULT 50,
        label_height NUMERIC     DEFAULT 30,
        font_family  TEXT        DEFAULT 'Courier New',
        font_size    INTEGER     DEFAULT 14,
        alignment    TEXT        DEFAULT 'center',
        rotation     INTEGER     DEFAULT 0,
        status       TEXT        DEFAULT 'done',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    return { ok: true };
  } catch (err) {
    console.warn("Neon initDb failed, relying on local fallback:", err.message);
    return { ok: true, fallback: true };
  }
}

// ─── Print Jobs ───────────────────────────────────────────────────────────────
export async function insertPrintJob(job) {
  const {
    id, productName, sku = "", serial = "", price = "", copies = 1,
    printerName = "", printerType = "usb",
    labelWidth = 50, labelHeight = 30,
    fontFamily = "Courier New", fontSize = 14,
    alignment = "center", rotation = 0, status = "done",
  } = job;

  if (sql) {
    try {
      await sql`
        INSERT INTO print_jobs
          (id, product_name, sku, serial, price, copies,
           printer_name, printer_type,
           label_width, label_height,
           font_family, font_size, alignment, rotation, status)
        VALUES
          (${id}, ${productName}, ${sku}, ${serial}, ${price}, ${copies},
           ${printerName}, ${printerType},
           ${labelWidth}, ${labelHeight},
           ${fontFamily}, ${fontSize}, ${alignment}, ${rotation}, ${status})
        ON CONFLICT (id) DO NOTHING
      `;
      return;
    } catch (e) {
      console.warn("Neon insertPrintJob failed, using fallback:", e.message);
    }
  }

  // Fallback
  const history = getLocalHistory();
  history.unshift({ ...job, created_at: new Date().toISOString() });
  saveLocalHistory(history);
}

export async function getRecentJobs(limit = 50) {
  if (sql) {
    try {
      return await sql`
        SELECT * FROM print_jobs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } catch (e) {
      console.warn("Neon getRecentJobs failed, using fallback:", e.message);
    }
  }
  return getLocalHistory().slice(0, limit);
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  if (sql) {
    try {
      const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
      return rows[0]?.value ?? null;
    } catch (e) {
      console.warn("Neon getSetting failed, using fallback:", e.message);
    }
  }
  return getLocalSettings()[key] ?? null;
}

export async function setSetting(key, value) {
  if (sql) {
    try {
      await sql`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (${key}, ${String(value)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${String(value)}, updated_at = NOW()
      `;
      return;
    } catch (e) {
      console.warn("Neon setSetting failed, using fallback:", e.message);
    }
  }
  const settings = getLocalSettings();
  settings[key] = String(value);
  saveLocalSettings(settings);
}
