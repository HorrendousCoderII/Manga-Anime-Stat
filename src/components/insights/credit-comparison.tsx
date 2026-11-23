"use client";

import clsx from "clsx";
import { Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { computeCreditStats, creditCoverage, type CreditStat, type ScoreSource } from "@/lib/analytics/credits";
import type { ListEntry, Medium, MediumMode } from "@/lib/types";
import { CHART, EmptyChart, Panel, Segmented, TooltipCard, fmt, nf, signed } from "./ui";

type SortKey = "titles" | "mean" | "std";
const MAX_ROWS = 12;

interface BoxShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CreditStat;
}

/** Horizontal box-and-whisker drawn inside the [min, max] range bar Recharts lays out for us. */
function BoxShape({ x = 0, y = 0, width = 0, height = 0, payload: s }: BoxShapeProps) {
  if (!s || s.min === null || s.max === null) return <g />;
  const span = s.max - s.min;
  const at = (v: number | null) => (v === null || span === 0 ? x : x + (width * (v - s.min!)) / span);
  const mid = y + height / 2;
  const boxH = Math.min(height, 16);
  const q1 = at(s.q1);
  const q3 = at(s.q3);
  return (
    <g>
      <line x1={x} x2={x + width} y1={mid} y2={mid} stroke={CHART.violet} strokeOpacity={0.6} />
      <line x1={x} x2={x} y1={mid - boxH / 3} y2={mid + boxH / 3} stroke={CHART.violet} strokeOpacity={0.6} />
      <line x1={x + width} x2={x + width} y1={mid - boxH / 3} y2={mid + boxH / 3} stroke={CHART.violet} strokeOpacity={0.6} />
      <rect
        x={q1}
        y={mid - boxH / 2}
        width={Math.max(q3 - q1, 2)}
        height={boxH}
        rx={4}
        fill={CHART.violet}
        fillOpacity={0.28}
        stroke={CHART.violet}
      />
      <line x1={at(s.median)} x2={at(s.median)} y1={mid - boxH / 2} y2={mid + boxH / 2} stroke={CHART.fuchsia} strokeWidth={2.5} />
      <circle cx={at(s.mean)} cy={mid} r={3.5} fill="var(--background)" stroke={CHART.amber} strokeWidth={2} />
    </g>
  );
}

export function CreditComparison({ entries, mode }: { entries: ListEntry[]; mode: MediumMode }) {
  const [tab, setTab] = useState<Medium>(mode === "manga" ? "manga" : "anime");
  const medium: Medium = mode === "combined" ? tab : mode;
  const [source, setSource] = useState<ScoreSource>("user");
  const [sort, setSort] = useState<SortKey>("titles");
  const [minTitles, setMinTitles] = useState(2);

  const stats = useMemo(() => computeCreditStats(entries, medium, { source, minTitles }), [entries, medium, source, minTitles]);
  const coverage = useMemo(() => creditCoverage(entries, medium), [entries, medium]);
  const rows = useMemo(() => {
    const scored = stats.filter((s) => s.scored > 0);
    const by: Record<SortKey, (a: CreditStat, b: CreditStat) => number> = {
      titles: () => 0,
      mean: (a, b) => b.mean! - a.mean!,
      std: (a, b) => a.std! - b.std!,
    };
    return [...scored].sort((a, b) => by[sort](a, b) || b.titles - a.titles).slice(0, MAX_ROWS);
  }, [stats, sort]);

  const noun = medium === "anime" ? "studio" : "magazine";
  const lo = rows.length ? Math.max(1, Math.floor(Math.min(...rows.map((r) => r.min!))) - 0.5) : 1;

  return (
    <Panel
      icon={Building2}
      title={mode === "combined" ? "Studios & magazines" : medium === "anime" ? "Studio comparison" : "Magazine comparison"}
      subtitle={
        <>
          Score spread per {noun}: whiskers min–max, box Q1–Q3, <span className="text-fuchsia-500">median</span>,{" "}
          <span className="text-amber-500">mean</span>.{" "}
          {coverage < 0.999 && `${noun[0].toUpperCase() + noun.slice(1)} known for ${Math.round(coverage * 100)}% of titles in view.`}
        </>
      }
      actions={
        <>
          {mode === "combined" && (
            <Segmented label="Medium" value={tab} onChange={setTab} options={[{ value: "anime", label: "Studios" }, { value: "manga", label: "Magazines" }]} />
          )}
          <Segmented label="Score source" value={source} onChange={setSource} options={[{ value: "user", label: "Your scores" }, { value: "global", label: "MAL scores" }]} />
          <Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: "titles", label: "Most titles" }, { value: "mean", label: "Highest avg" }, { value: "std", label: "Most consistent" }]} />
          <Segmented label="Minimum titles" value={minTitles} onChange={setMinTitles} options={[2, 3, 5].map((n) => ({ value: n, label: `${n}+` }))} />
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyChart>
          No {noun} has {minTitles}+ {source === "user" ? "scored " : ""}titles in this view.
        </EmptyChart>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div style={{ height: Math.max(rows.length * 34 + 40, 160) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 8, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[lo, 10]} tick={CHART.tick} stroke={CHART.grid} allowDecimals={false} tickCount={Math.round(10 - lo) + 1} />
                <YAxis type="category" dataKey="name" width={150} tick={CHART.tick} stroke={CHART.grid} interval={0} />
                <Tooltip cursor={{ fill: "var(--card-border)" }} isAnimationActive={false} content={<BoxTooltip source={source} />} />
                <Bar dataKey={(s: CreditStat) => [s.min, s.max]} shape={<BoxShape />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted">
                <tr className="border-b border-card-border">
                  <th className="py-1.5 text-left font-medium capitalize">{noun}</th>
                  <th className="text-right font-medium">Titles</th>
                  <th className="text-right font-medium">Avg</th>
                  <th className="text-right font-medium">σ</th>
                  {source === "user" && <th className="text-right font-medium">vs MAL</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const d = s.mean !== null && s.meanGlobal !== null ? s.mean - s.meanGlobal : null;
                  return (
                    <tr key={s.name} className="border-b border-card-border/60 last:border-0">
                      <td className="max-w-36 truncate py-1.5 pr-2 font-medium" title={s.name}>
                        {s.name}
                      </td>
                      <td className="text-right text-muted">
                        {s.scored < s.titles ? `${s.scored}/${s.titles}` : s.titles}
                      </td>
                      <td className="text-right font-semibold">{fmt(s.mean)}</td>
                      <td className="text-right">{fmt(s.std)}</td>
                      {source === "user" && (
                        <td className={clsx("text-right", d === null ? "text-muted" : d >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
                          {signed(d)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              σ is the standard deviation of {source === "user" ? "your" : "MAL"} scores; lower means more consistent. Titles shows scored/total when they differ.
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function BoxTooltip({ active, payload, source }: { active?: boolean; payload?: { payload: CreditStat }[]; source: ScoreSource }) {
  const s = active ? payload?.[0]?.payload : undefined;
  if (!s) return null;
  return (
    <TooltipCard>
      <p className="font-semibold">{s.name}</p>
      <p className="text-muted">
        {nf.format(s.titles)} titles · {nf.format(s.scored)} scored ({source === "user" ? "by you" : "on MAL"})
      </p>
      <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 tabular-nums">
        <span className="text-muted">Mean</span>
        <span>{fmt(s.mean)}</span>
        <span className="text-muted">Std dev</span>
        <span>{fmt(s.std)}</span>
        <span className="text-muted">Median</span>
        <span>{fmt(s.median)}</span>
        <span className="text-muted">Q1–Q3</span>
        <span>
          {fmt(s.q1)}–{fmt(s.q3)}
        </span>
        <span className="text-muted">Range</span>
        <span>
          {fmt(s.min, 1)}–{fmt(s.max, 1)}
        </span>
        {source === "user" && (
          <>
            <span className="text-muted">MAL mean</span>
            <span>{fmt(s.meanGlobal)}</span>
          </>
        )}
      </div>
    </TooltipCard>
  );
}
