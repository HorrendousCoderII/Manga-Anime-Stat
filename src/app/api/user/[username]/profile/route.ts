import { NextResponse, type NextRequest } from "next/server";
import { fetchUserProfile, USERNAME_PATTERN } from "@/lib/server/sources";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchUserProfile(username));
  } catch (err) {
    const status = err instanceof Error && "status" in err && typeof err.status === "number" ? err.status : 502;
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
