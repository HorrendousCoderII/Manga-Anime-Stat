import { NextResponse, type NextRequest } from "next/server";
import { fetchUserList, USERNAME_PATTERN } from "@/lib/server/sources";
import type { ListEntry, Medium } from "@/lib/types";

export interface UserListsResponse {
  username: string;
  lists: Partial<Record<Medium, ListEntry[]>>;
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

  const body: UserListsResponse = { username, lists: {}, listErrors: {} };
  MEDIA.forEach((medium, i) => {
    const r = results[i];
    if (r.status === "fulfilled") body.lists[medium] = r.value;
    else body.listErrors[medium] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  });
  return NextResponse.json(body);
}
