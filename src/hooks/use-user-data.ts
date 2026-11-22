"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetailsResponse } from "@/app/api/details/route";
import type { UserListsResponse } from "@/app/api/user/[username]/route";
import { mergeMedia } from "@/lib/normalize";
import type { ListEntry, Media, Medium, UserProfile } from "@/lib/types";

const BATCH_SIZE = 5;

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface EnrichmentState {
  done: number;
  total: number;
  running: boolean;
  upstreamDown: boolean;
}

const key = (medium: Medium, id: number) => `${medium}:${id}`;

export function useUserData(username: string | null, preferred: Medium) {
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UserListsResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [details, setDetails] = useState<Map<string, Media>>(new Map());
  const [enrichment, setEnrichment] = useState<EnrichmentState>({ done: 0, total: 0, running: false, upstreamDown: false });
  const preferredRef = useRef(preferred);
  preferredRef.current = preferred;

  const enrich = useCallback(async (res: UserListsResponse, signal: AbortSignal) => {
    const order: Medium[] = preferredRef.current === "manga" ? ["manga", "anime"] : ["anime", "manga"];
    const queue = order.flatMap((medium) =>
      (res.lists[medium] ?? [])
        .filter((e) => e.listStatus === "completed" && !e.media.detailed)
        .sort((a, b) => (b.userScore ?? 0) - (a.userScore ?? 0))
        .map((e) => ({ medium, id: e.media.malId })),
    );
    setEnrichment({ done: 0, total: queue.length, running: queue.length > 0, upstreamDown: false });

    for (let i = 0; i < queue.length && !signal.aborted; ) {
      const medium = queue[i].medium;
      const batch: number[] = [];
      while (i < queue.length && queue[i].medium === medium && batch.length < BATCH_SIZE) batch.push(queue[i++].id);
      try {
        const r = await fetch(`/api/details?medium=${medium}&ids=${batch.join(",")}`, { signal });
        const body = (await r.json()) as DetailsResponse;
        if (body.items.length) {
          setDetails((prev) => {
            const next = new Map(prev);
            for (const item of body.items) next.set(key(item.medium, item.malId), item);
            return next;
          });
        }
        setEnrichment((s) => ({ ...s, done: i }));
        if (body.upstreamDown) {
          setEnrichment((s) => ({ ...s, running: false, upstreamDown: true }));
          return;
        }
      } catch {
        if (signal.aborted) return;
      }
    }
    if (!signal.aborted) setEnrichment((s) => ({ ...s, running: false }));
  }, []);

  useEffect(() => {
    if (!username) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    setData(null);
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    setDetails(new Map());
    setEnrichment({ done: 0, total: 0, running: false, upstreamDown: false });

    (async () => {
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(username)}/profile`, { signal: controller.signal });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `Profile request failed (${r.status})`);
        setProfile(body as UserProfile);
      } catch (err) {
        if (controller.signal.aborted) return;
        setProfileError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setProfileLoading(false);
      }
    })();

    (async () => {
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(username)}`, { signal: controller.signal });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
        setData(body as UserListsResponse);
        setState("ready");
        void enrich(body as UserListsResponse, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    })();
    return () => controller.abort();
  }, [username, enrich]);

  const entries = useMemo<ListEntry[]>(() => {
    if (!data) return [];
    return (["anime", "manga"] as Medium[]).flatMap((medium) =>
      (data.lists[medium] ?? []).map((entry) => {
        const d = details.get(key(medium, entry.media.malId));
        return d ? { ...entry, media: mergeMedia(entry.media, d) } : entry;
      }),
    );
  }, [data, details]);

  return { state, error, data, entries, enrichment, profile, profileError, profileLoading };
}
