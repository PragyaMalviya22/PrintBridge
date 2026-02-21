import { NextResponse } from "next/server";
import { getPendingJobs, markJobDone } from "@/lib/printer";

// GET: Agent polls for pending print jobs
export async function GET() {
  return NextResponse.json({ success: true, jobs: getPendingJobs() });
}

// POST: Agent marks a job as done or failed
export async function POST(request) {
  try {
    const { jobId, status } = await request.json();
    if (!jobId) return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    const job = markJobDone(jobId, status || "done");
    return NextResponse.json({ success: true, job });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
