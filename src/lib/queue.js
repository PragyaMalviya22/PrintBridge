let redis = null;

function isCloud() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getRedis() {
  if (redis) return redis;
  if (!isCloud()) return null;
  const { Redis } = await import("@upstash/redis");
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

export async function addToQueue(job) {
  const entry = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...job,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const r = await getRedis();
  if (r) {
    await r.set(`printjob:${entry.id}`, JSON.stringify(entry), { ex: 3600 });
    await r.lpush("printqueue:pending", entry.id);
    await r.ltrim("printqueue:pending", 0, 199);
  } else {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "print-queue.json");
    let queue = [];
    try { queue = JSON.parse(fs.readFileSync(file, "utf-8")); } catch {}
    queue.push(entry);
    fs.writeFileSync(file, JSON.stringify(queue.slice(-200), null, 2));
  }

  return entry;
}

export async function getPendingJobs() {
  const r = await getRedis();
  if (r) {
    const ids = await r.lrange("printqueue:pending", 0, -1);
    const jobs = [];
    for (const id of ids) {
      const data = await r.get(`printjob:${id}`);
      if (data) {
        const job = typeof data === "string" ? JSON.parse(data) : data;
        if (job.status === "pending") jobs.push(job);
      }
    }
    return jobs;
  } else {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "print-queue.json");
    try {
      const queue = JSON.parse(fs.readFileSync(file, "utf-8"));
      return queue.filter((j) => j.status === "pending");
    } catch { return []; }
  }
}

export async function markJobDone(jobId, status = "done") {
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
  } else {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "print-queue.json");
    try {
      const queue = JSON.parse(fs.readFileSync(file, "utf-8"));
      const job = queue.find((j) => j.id === jobId);
      if (job) {
        job.status = status;
        job.completedAt = new Date().toISOString();
        fs.writeFileSync(file, JSON.stringify(queue.slice(-200), null, 2));
        return job;
      }
    } catch {}
    return null;
  }
}