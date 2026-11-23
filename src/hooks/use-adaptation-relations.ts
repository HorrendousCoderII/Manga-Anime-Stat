"use client";

import { useEffect, useMemo, useState } from "react";
import type { RelationsResponse } from "@/app/api/relations/route";
import type { RelatedLink } from "@/lib/analytics/adaptation-gap";
import type { ListEntry, Medium } from "@/lib/types";

const BATCH = 5;
const MAX_TITLES = 40;

export interface RelationsState {
  map: Map<string, RelatedLink[]>;
  done: number;
  total: number;
  running: boolean;
}

/**
 * Lazily fetch cross-medium relations for scored titles so adaptation pairing can
 * upgrade title matches to MAL/Jikan relation matches. Caps volume to keep rate limits happy.
 */
export function useAdaptationRelations(entries: ListEntry[], enabled: boolean): RelationsState {
  const targets = useMemo(() => {
    const scored = entries.filter((e) => e.media.score !== null && e.listStatus !== "planned");
    const byMedium = (medium: Medium) =>
      scored
        .filter((e) => e.media.medium === medium)
        .sort((a, b) => (b.userScore ?? 0) - (a.userScore ?? 0) || (b.media.scoredBy ?? 0) - (a.media.scoredBy ?? 0))
        .slice(0, Math.ceil(MAX_TITLES / 2))
        .map((e) => ({ medium, id: e.media.malId }));
    // Prefer a mix so either side can discover the Adaptation link.
    return [...byMedium("anime"), ...byMedium("manga")].slice(0, MAX_TITLES);
  }, [entries]);

  const targetKey = useMemo(() => targets.map((t) => `${t.medium}:${t.id}`).join(","), [targets]);
  const [map, setMap] = useState<Map<string, RelatedLink[]>>(() => new Map());
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!enabled || !targets.length) {
      setMap(new Map());
      setDone(0);
      setRunning(false);
      return;
    }
    const controller = new AbortController();
    setMap(new Map());
    setDone(0);
    setRunning(true);

    (async () => {
      const next = new Map<string, RelatedLink[]>();
      let i = 0;
      while (i < targets.length && !controller.signal.aborted) {
        const medium = targets[i].medium;
        const batch: number[] = [];
        while (i < targets.length && targets[i].medium === medium && batch.length < BATCH) {
          batch.push(targets[i++].id);
        }
        try {
          const r = await fetch(`/api/relations?medium=${medium}&ids=${batch.join(",")}`, { signal: controller.signal });
          if (!r.ok) continue;
          const body = (await r.json()) as RelationsResponse;
          for (const item of body.items) {
            next.set(`${item.medium}:${item.malId}`, item.related);
          }
          setMap(new Map(next));
          setDone(i);
        } catch {
          if (controller.signal.aborted) return;
        }
      }
      if (!controller.signal.aborted) setRunning(false);
    })();

    return () => controller.abort();
    // targetKey captures targets identity without depending on the array reference.
  }, [enabled, targetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { map, done, total: targets.length, running };
}
