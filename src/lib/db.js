import { neon } from "@neondatabase/serverless";

// Create a SQL client from the DATABASE_URL env var
const sql = neon(process.env.DATABASE_URL);

export default sql;

// ─── Schema initialisation ───────────────────────────────────────────────────
// Call once via GET /api/db/init to create tables if they don't exist.
export async function initDb() {
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
}

export async function getRecentJobs(limit = 50) {
  const rows = await sql`
    SELECT * FROM print_jobs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${String(value)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${String(value)}, updated_at = NOW()
  `;
}
