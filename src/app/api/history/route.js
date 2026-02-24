import { insertPrintJob, getRecentJobs } from "@/lib/db";

// GET /api/history  — fetch last 50 print jobs
export async function GET() {
  try {
    const jobs = await getRecentJobs(50);
    return Response.json({ ok: true, jobs });
  } catch (err) {
    console.error("History GET error:", err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST /api/history  — save a completed print job
export async function POST(req) {
  try {
    const body = await req.json();
    await insertPrintJob(body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("History POST error:", err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
