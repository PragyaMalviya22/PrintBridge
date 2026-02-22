import { NextResponse } from "next/server";
import { getPendingJobs, markJobDone } from "@/lib/queue";

export async function GET() {
  try {
    const jobs = await getPendingJobs();
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message, jobs: [] });
  }
}

export async function POST(request) {
  try {
    const { jobId, status } = await request.json();
    if (!jobId) return NextResponse.json({ success: false, error: "jobId required" }, { status: 400 });
    const job = await markJobDone(jobId, status || "done");
    return NextResponse.json({ success: true, job });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}