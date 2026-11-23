"use client";

import { useMemo, useState } from "react";
import { ALL_STATUSES, applyFilters, DEFAULT_FILTERS, scopeEntries, yearExtent, type ChartFilters } from "@/lib/analytics/filters";
import type { ListEntry, ListStatus, MediumMode } from "@/lib/types";
import { ChartFiltersBar } from "./chart-filters";
import { CreditComparison } from "./credit-comparison";
import { ScoreScatter } from "./score-scatter";
import { TagBreakdown } from "./tag-breakdown";

export function Insights({ entries, mode }: { entries: ListEntry[]; mode: MediumMode }) {
  const [filters, setFilters] = useState<ChartFilters>(DEFAULT_FILTERS);
  const scoped = useMemo(() => scopeEntries(entries, mode), [entries, mode]);
  const extent = useMemo(() => yearExtent(scoped), [scoped]);
  const filtered = useMemo(() => applyFilters(entries, mode, filters), [entries, mode, filters]);
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ListStatus, number>;
    for (const e of scoped) counts[e.listStatus]++;
    return counts;
  }, [scoped]);

  return (
    <div className="mt-8 space-y-5">
      <div className="sticky top-2 z-20">
        <ChartFiltersBar
          filters={filters}
          onChange={setFilters}
          mode={mode}
          extent={extent}
          statusCounts={statusCounts}
          shown={filtered.length}
          total={scoped.length}
        />
      </div>
      <ScoreScatter entries={filtered} mode={mode} />
      <TagBreakdown entries={filtered} mode={mode} />
      <CreditComparison key={mode} entries={filtered} mode={mode} />
    </div>
  );
}
