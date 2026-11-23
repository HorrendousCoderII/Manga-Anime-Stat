"use client";

import { Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { computeTagBreakdown, READING_MINUTES_PER_CHAPTER, SCORE_BUCKETS, topWithOther, totalTime, type TagGroup, type TagStat } from "@/lib/analytics/tags";
import type { ListEntry, MediumMode } from "@/lib/types";
import { CHART, EmptyChart, OTHER_COLOR, PALETTE, Panel, Segmented, TooltipCard, fmt, nf, signed, timeUnit } from "./ui";

type Metric = "titles" | "time";
const HEATMAP_ROWS = 12;
const BAR_ROWS = 10;

export function TagBreakdown({ entries, mode }: { entries: ListEntry[]; mode: MediumMode }) {
  const [group, setGroup] = useState<TagGroup>("genres");
  const [metric, setMetric] = useState<Metric>("time");
  const unit = timeUnit(mode);
  const stats = useMemo(() => computeTagBreakdown(entries, group), [entries, group]);
  const totals = useMemo(() => totalTime(entries), [entries]);
  const value = (s: { titles: number; hours: number; chapters: number }) => (metric === "titles" ? s.titles : s[unit.key]);
  const fmtValue = (v: number) => (metric === "titles" ? `${nf.format(v)} titles` : `${nf.format(Math.round(v))} ${unit.short}`);

  const slices = topWithOther(stats, value, (s) => s.name, 8);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const bars = stats.filter((s) => s.meanUser !== null).slice(0, BAR_ROWS);

  return (
    <Panel
      icon={Tags}
      title="Genre, theme & demographic breakdown"
      subtitle={
        mode === "combined"
          ? `Time mixes anime watch hours with manga reading estimated at ${READING_MINUTES_PER_CHAPTER} min/chapter.`
          : "Where your time goes and how you score each tag. A title counts toward every tag it carries."
      }
      actions={
        <>
          <Segmented
            label="Tag group"
            value={group}
            onChange={setGroup}
            options={[
              { value: "genres", label: "Genres" },
              { value: "themes", label: "Themes" },
              { value: "demographics", label: "Demographics" },
            ]}
          />
          <Segmented
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "time", label: mode === "manga" ? "Chapters" : "Hours" },
              { value: "titles", label: "Titles" },
            ]}
          />
        </>
      }
    >
      {stats.length === 0 ? (
        <EmptyChart>No {group} on the titles matching these filters yet.</EmptyChart>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid items-center gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <div className="relative h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="100%"
                      paddingAngle={1.5}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {slices.map((s, i) => (
                        <Cell key={s.name} fill={s.name === "Other" ? OTHER_COLOR : PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      isAnimationActive={false}
                      content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <TooltipCard>
                            <span className="font-semibold">{payload[0].name}</span> · {fmtValue(Number(payload[0].value))} ·{" "}
                            {Math.round((Number(payload[0].value) / total) * 100)}%
                          </TooltipCard>
                        ) : null
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-xl font-semibold tabular-nums">{nf.format(Math.round(value(totals)))}</div>
                    <div className="text-[11px] text-muted">{metric === "titles" ? "titles" : unit.label.toLowerCase()}</div>
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs">
                {slices.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.name === "Other" ? OTHER_COLOR : PALETTE[i % PALETTE.length] }} />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-muted tabular-nums">{fmtValue(s.value)}</span>
                    <span className="w-9 text-right font-medium tabular-nums">{Math.round((s.value / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-medium text-muted">Your average vs MAL average · top {bars.length} by titles</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barGap={1} barCategoryGap="22%">
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[Math.max(0, Math.floor(minScore(bars)) - 1), 10]} tick={CHART.tick} stroke={CHART.grid} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={104} tick={CHART.tick} stroke={CHART.grid} interval={0} />
                    <Tooltip cursor={{ fill: "var(--card-border)" }} isAnimationActive={false} content={<TagTooltip fmtValue={fmtValue} unitKey={unit.key} />} />
                    <Bar dataKey="meanUser" name="You" fill={CHART.violet} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                    <Bar dataKey="meanGlobal" name="MAL" fill={CHART.pink} fillOpacity={0.55} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: CHART.violet }} />You</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm opacity-60" style={{ background: CHART.pink }} />MAL</span>
              </div>
            </div>
          </div>

          <Heatmap stats={stats.slice(0, HEATMAP_ROWS)} metric={metric} value={value} fmtValue={fmtValue} unitShort={unit.short} />
        </>
      )}
    </Panel>
  );
}

const minScore = (rows: TagStat[]) => Math.min(...rows.flatMap((r) => [r.meanUser ?? 10, r.meanGlobal ?? 10]));

function TagTooltip({
  active,
  payload,
  fmtValue,
  unitKey,
}: {
  active?: boolean;
  payload?: { payload: TagStat }[];
  fmtValue: (v: number) => string;
  unitKey: "hours" | "chapters";
}) {
  const s = active ? payload?.[0]?.payload : undefined;
  if (!s) return null;
  const delta = s.meanUser !== null && s.meanGlobal !== null ? s.meanUser - s.meanGlobal : null;
  return (
    <TooltipCard>
      <p className="font-semibold">{s.name}</p>
      <p className="text-muted tabular-nums">
        {nf.format(s.titles)} titles · {fmtValue(s[unitKey]).replace(/ titles$/, "")}
      </p>
      <p className="mt-1 tabular-nums">
        You {fmt(s.meanUser)} · MAL {fmt(s.meanGlobal)} · <span className={delta !== null && delta < 0 ? "text-rose-500" : "text-emerald-500"}>{signed(delta)}</span>
      </p>
    </TooltipCard>
  );
}

function Heatmap({
  stats,
  metric,
  value,
  fmtValue,
  unitShort,
}: {
  stats: TagStat[];
  metric: Metric;
  value: (s: { titles: number; hours: number; chapters: number }) => number;
  fmtValue: (v: number) => string;
  unitShort: string;
}) {
  const max = Math.max(...stats.flatMap((s) => s.buckets.map(value)), 1);
  const scoreColor = (d: number | null) =>
    d === null ? undefined : d >= 0.25 ? "text-emerald-600 dark:text-emerald-300" : d <= -0.25 ? "text-rose-600 dark:text-rose-300" : undefined;
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-medium text-muted">
        {metric === "titles" ? "Titles" : `Time (${unitShort})`} by the score you gave · top {stats.length} tags
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-xs tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="w-32 text-left font-medium">Tag</th>
              {SCORE_BUCKETS.map((b) => (
                <th key={b} className="font-medium" title={b === "—" ? "Unscored" : `Scored ${b}`}>
                  {b === "—" ? "Unscored" : b}
                </th>
              ))}
              <th className="pl-2 text-right font-medium">Total</th>
              <th className="text-right font-medium">Avg</th>
              <th className="text-right font-medium">vs MAL</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const delta = s.meanUser !== null && s.meanGlobal !== null ? s.meanUser - s.meanGlobal : null;
              return (
                <tr key={s.name}>
                  <td className="truncate pr-2 font-medium">{s.name}</td>
                  {s.buckets.map((b, i) => {
                    const v = value(b);
                    const alpha = v ? 0.08 + 0.85 * Math.sqrt(v / max) : 0;
                    return (
                      <td
                        key={i}
                        title={`${s.name} · ${SCORE_BUCKETS[i] === "—" ? "unscored" : `scored ${SCORE_BUCKETS[i]}`} · ${fmtValue(v)}`}
                        className="h-8 min-w-10 rounded-md text-center"
                        style={{
                          background: v ? `color-mix(in oklab, ${CHART.violet} ${Math.round(alpha * 100)}%, transparent)` : "color-mix(in oklab, var(--foreground) 4%, transparent)",
                          color: alpha > 0.55 ? "white" : undefined,
                        }}
                      >
                        {v ? (metric === "titles" ? v : Math.round(v)) : ""}
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right text-muted">{metric === "titles" ? s.titles : nf.format(Math.round(value(s)))}</td>
                  <td className="text-right font-semibold">{fmt(s.meanUser)}</td>
                  <td className={`text-right ${scoreColor(delta) ?? "text-muted"}`}>{signed(delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
