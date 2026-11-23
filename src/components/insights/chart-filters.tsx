"use client";

import clsx from "clsx";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { ALL_STATUSES, DEFAULT_FILTERS, type ChartFilters } from "@/lib/analytics/filters";
import type { ListStatus, MediumMode } from "@/lib/types";
import { nf } from "./ui";

function statusLabel(s: ListStatus, mode: MediumMode): string {
  const verb = mode === "anime" ? "watch" : mode === "manga" ? "read" : null;
  switch (s) {
    case "completed":
      return "Completed";
    case "in_progress":
      return verb === "watch" ? "Watching" : verb === "read" ? "Reading" : "In progress";
    case "on_hold":
      return "On hold";
    case "dropped":
      return "Dropped";
    case "planned":
      return verb ? `Plan to ${verb}` : "Planned";
  }
}

export function ChartFiltersBar({
  filters,
  onChange,
  mode,
  extent,
  statusCounts,
  shown,
  total,
}: {
  filters: ChartFilters;
  onChange: (f: ChartFilters) => void;
  mode: MediumMode;
  extent: [number, number] | null;
  statusCounts: Record<ListStatus, number>;
  shown: number;
  total: number;
}) {
  const [lo, hi] = extent ?? [2000, 2025];
  const from = Math.max(lo, Math.min(filters.yearFrom ?? lo, hi));
  const to = Math.min(hi, Math.max(filters.yearTo ?? hi, lo));
  const setYears = (a: number, b: number) =>
    onChange({ ...filters, yearFrom: a <= lo ? null : a, yearTo: b >= hi ? null : b });
  const toggleStatus = (s: ListStatus) => {
    const has = filters.statuses.includes(s);
    if (has && filters.statuses.length === 1) return;
    onChange({ ...filters, statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] });
  };
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);
  const pctLo = hi > lo ? ((from - lo) / (hi - lo)) * 100 : 0;
  const pctHi = hi > lo ? ((to - lo) / (hi - lo)) * 100 : 100;

  return (
    <section className="rounded-3xl border border-card-border bg-card p-4 shadow-sm backdrop-blur sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-violet-500" />
          Filters
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-muted tabular-nums">
            {nf.format(shown)} / {nf.format(total)}
          </span>
        </div>

        <div className="min-w-56 flex-1">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-muted">Release year</span>
            <span className="font-medium tabular-nums">
              {from} – {to}
            </span>
          </div>
          <div className="dual-range relative h-5">
            <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-foreground/10" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{ left: `${pctLo}%`, width: `${pctHi - pctLo}%` }}
            />
            <input
              type="range"
              aria-label="Earliest release year"
              min={lo}
              max={hi}
              value={from}
              disabled={!extent}
              onChange={(e) => setYears(Math.min(Number(e.target.value), to), to)}
            />
            <input
              type="range"
              aria-label="Latest release year"
              min={lo}
              max={hi}
              value={to}
              disabled={!extent}
              onChange={(e) => setYears(from, Math.max(Number(e.target.value), from))}
            />
          </div>
        </div>

        <div className="flex gap-3">
          {mode !== "manga" && (
            <MinInput label="Min episodes" value={filters.minEpisodes} onChange={(v) => onChange({ ...filters, minEpisodes: v })} />
          )}
          {mode !== "anime" && (
            <MinInput label="Min chapters" value={filters.minChapters} onChange={(v) => onChange({ ...filters, minChapters: v })} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_STATUSES.map((s) => {
            const on = filters.statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  on
                    ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200"
                    : "border-card-border text-muted hover:text-foreground",
                )}
              >
                {statusLabel(s, mode)}
                <span className="tabular-nums opacity-60">{statusCounts[s]}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            disabled={isDefault}
            title="Reset filters"
            className="ml-1 grid size-7 place-items-center rounded-full text-muted transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function MinInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-muted">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value || ""}
        placeholder="Any"
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="h-8 w-24 rounded-lg border border-card-border bg-background/60 px-2.5 tabular-nums outline-none focus:border-violet-500/60 focus:ring-4 focus:ring-[var(--ring)]"
      />
    </label>
  );
}
