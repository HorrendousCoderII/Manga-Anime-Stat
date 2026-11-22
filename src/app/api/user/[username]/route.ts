import { NextResponse, type NextRequest } from "next/server";
import { fetchUserList, USERNAME_PATTERN, type ListSource } from "@/lib/server/sources";
import type { ListEntry, Medium } from "@/lib/types";

export interface UserListsResponse {
  username: string;
  lists: Partial<Record<Medium, ListEntry[]>>;
  listSources: Partial<Record<Medium, ListSource>>;
  fallbackReasons: Partial<Record<Medium, string>>;
  listErrors: Partial<Record<Medium, string>>;
}

const MEDIA: Medium[] = ["anime", "manga"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Usernames are 2–16 letters, digits, _ or -." }, { status: 400 });
  }

  const results = await Promise.allSettled(MEDIA.map((m) => fetchUserList(username, m)));
  const notFound = results.every(
    (r) => r.status === "rejected" && r.reason?.name === "UserListError" && r.reason.code === "not_found_or_private",
  );
  if (notFound) {
    return NextResponse.json(
      { error: `No public lists found for "${username}". Check the spelling or the list's privacy setting.` },
      { status: 404 },
    );
  }

  const body: UserListsResponse = { username, lists: {}, listSources: {}, fallbackReasons: {}, listErrors: {} };
  MEDIA.forEach((medium, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      body.lists[medium] = r.value.entries;
      body.listSources[medium] = r.value.source;
      if (r.value.fallbackReason) body.fallbackReasons[medium] = r.value.fallbackReason;
    } else {
      body.listErrors[medium] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  });
  return NextResponse.json(body);
}
