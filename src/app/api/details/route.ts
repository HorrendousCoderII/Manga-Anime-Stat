import { NextResponse, type NextRequest } from "next/server";
import { detailsUnavailable, fetchMediaDetails } from "@/lib/server/sources";
import type { Media, Medium } from "@/lib/types";

export interface DetailsResponse {
  items: Media[];
  failed: number[];
  upstreamDown: boolean;
}

const MAX_IDS = 10;

export async function GET(req: NextRequest) {
  const medium = req.nextUrl.searchParams.get("medium") as Medium | null;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_IDS);
  if ((medium !== "anime" && medium !== "manga") || ids.length === 0) {
    return NextResponse.json({ error: "Expected ?medium=anime|manga&ids=1,2,3" }, { status: 400 });
  }

  const body: DetailsResponse = { items: [], failed: [], upstreamDown: false };
  // Sequential on purpose: the shared upstream queues do the pacing, and stopping early on outage saves requests.
  for (const id of ids) {
    if (detailsUnavailable()) {
      body.upstreamDown = true;
      body.failed.push(id);
      continue;
    }
    try {
      body.items.push(await fetchMediaDetails(medium, id));
    } catch (err) {
      if (err instanceof Error && err.name === "UpstreamUnavailableError") body.upstreamDown = true;
      body.failed.push(id);
    }
  }
  return NextResponse.json(body);
}
