/**
 * queue.js — Print job queue with Neon PostgreSQL as primary storage.
 * Falls back to Upstash Redis (cloud) or local JSON file when DB is unavailable.
 */

// ─── Neon (primary) ──────────────────────────────────────────────────────────
function isNeon() {
  return !!process.env.DATABASE_URL;
}

async function getNeonDb() {
  if (!isNeon()) return null;
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL);
}

// ─── Upstash Redis (secondary) ───────────────────────────────────────────────
let redis = null;
function isCloud() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
async function getRedis() {
  if (redis) return redis;
  if (!isCloud()) return null;
  const { Redis } = await import("@upstash/redis");
  redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

// ─── Add a job to the queue ──────────────────────────────────────────────────
export async function addToQueue(job) {
  const entry = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...job,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  // 1. Try Neon
  const sql = await getNeonDb();
  if (sql) {
    try {
      await sql`
        INSERT INTO print_jobs
          (id, product_name, sku, serial, price, copies,
           printer_name, printer_type,
           label_width, label_height,
           font_family, font_size, alignment, rotation, status, tspl)
        VALUES
          (${entry.id},
           ${entry.text        || entry.productName || ""},
           ${entry.sku         || ""},
           ${entry.serial      || ""},
           ${entry.price       || ""},
           ${entry.copies      || 1},
           ${entry.printerName || ""},
           ${entry.printerType || "usb"},
           ${entry.width       || 50},
           ${entry.height      || 30},
           ${entry.fontFamily  || "Courier New"},
           ${entry.fontSize    || 14},
           ${entry.alignment   || "center"},
           ${entry.rotation    || 0},
           ${"pending"},
           ${entry.tspl        || ""})
        ON CONFLICT (id) DO NOTHING
      `;
      return entry;
    } catch (e) {
      console.warn("Neon addToQueue failed, falling back:", e.message);
    }
  }

  // 2. Try Redis
  const r = await getRedis();
  if (r) {
    await r.set(`printjob:${entry.id}`, JSON.stringify(entry), { ex: 3600 });
    await r.lpush("printqueue:pending", entry.id);
    await r.ltrim("printqueue:pending", 0, 199);
    return entry;
  }

  // 3. Local JSON file
  const fs   = require("fs");
  const path = require("path");
  const file = path.join(process.cwd(), "print-queue.json");
  let queue  = [];
  try { queue = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
  queue.push(entry);
  fs.writeFileSync(file, JSON.stringify(queue.slice(-200), null, 2));
  return entry;
}

// ─── Get pending jobs ────────────────────────────────────────────────────────
export async function getPendingJobs() {
  // 1. Try Neon
  const sql = await getNeonDb();
  if (sql) {
    try {
      const rows = await sql`
        SELECT * FROM print_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 50
      `;
      return rows.map(r => ({
        id:          r.id,
        text:        r.product_name,
        sku:         r.sku,
        serial:      r.serial,
        price:       r.price,
        copies:      r.copies,
        printerName: r.printer_name,
        printerType: r.printer_type,
        printerIp:   r.printer_ip   || "",
        printerPort: r.printer_port || 9100,
        tspl:        r.tspl         || "",
        status:      r.status,
      }));
    } catch (e) {
      console.warn("Neon getPendingJobs failed, falling back:", e.message);
    }
  }

  // 2. Try Redis
  const r = await getRedis();
  if (r) {
    const ids  = await r.lrange("printqueue:pending", 0, -1);
    const jobs = [];
    for (const id of ids) {
      const data = await r.get(`printjob:${id}`);
      if (data) {
        const job = typeof data === "string" ? JSON.parse(data) : data;
        if (job.status === "pending") jobs.push(job);
      }
    }
    return jobs;
  }

  // 3. Local JSON
  const fs   = require("fs");
  const path = require("path");
  const file = path.join(process.cwd(), "print-queue.json");
  try {
    const queue = JSON.parse(fs.readFileSync(file, "utf-8"));
    return queue.filter(j => j.status === "pending");
  } catch { return []; }
}

// ─── Mark job done/failed ────────────────────────────────────────────────────
export async function markJobDone(jobId, status = "done") {
  // 1. Try Neon
  const sql = await getNeonDb();
  if (sql) {
    try {
      await sql`
        UPDATE print_jobs
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${jobId}
      `;
      return { id: jobId, status };
    } catch (e) {
      console.warn("Neon markJobDone failed, falling back:", e.message);
    }
  }

  // 2. Try Redis
  const r = await getRedis();
  if (r) {
    const data = await r.get(`printjob:${jobId}`);
    if (data) {
      const job = typeof data === "string" ? JSON.parse(data) : data;
      job.status = status;
      job.completedAt = new Date().toISOString();
      await r.set(`printjob:${jobId}`, JSON.stringify(job), { ex: 3600 });
      await r.lrem("printqueue:pending", 0, jobId);
      return job;
    }
    return null;
  }

  // 3. Local JSON
  const fs   = require("fs");
  const path = require("path");
  const file = path.join(process.cwd(), "print-queue.json");
  try {
    const queue = JSON.parse(fs.readFileSync(file, "utf-8"));
    const job   = queue.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      job.completedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(queue.slice(-200), null, 2));
      return job;
    }
  } catch {}
  return null;
}