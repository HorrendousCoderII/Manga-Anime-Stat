import { NextResponse, type NextRequest } from "next/server";
import { fetchRelations, type RelationsResult } from "@/lib/server/sources";
import type { Medium } from "@/lib/types";

export interface RelationsResponse {
  items: RelationsResult[];
  failed: number[];
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

  const body: RelationsResponse = { items: [], failed: [] };
  for (const id of ids) {
    try {
      body.items.push(await fetchRelations(medium, id));
    } catch {
      body.failed.push(id);
    }
  }
  return NextResponse.json(body);
}
