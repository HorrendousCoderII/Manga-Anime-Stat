"use client";

import clsx from "clsx";
import { Crosshair, Gem, ThumbsDown } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { computeScoreBias, type BiasKind, type ScorePoint } from "@/lib/analytics/score-bias";
import type { ListEntry, MediumMode } from "@/lib/types";
import { CHART, EmptyChart, Panel, Segmented, Stat, TooltipCard, fmt, nf, signed } from "./ui";

const KIND_COLOR: Record<BiasKind, string> = { gem: CHART.emerald, overrated: CHART.rose, aligned: CHART.violet };
type Focus = "all" | "gem" | "overrated";

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ScorePoint;
}

export function ScoreScatter({ entries, mode }: { entries: ListEntry[]; mode: MediumMode }) {
  const bias = useMemo(() => computeScoreBias(entries), [entries]);
  const [focus, setFocus] = useState<Focus>("all");
  const [hovered, setHovered] = useState<string | null>(null);

  const xMin = useMemo(() => {
    const lo = Math.min(...bias.points.map((p) => p.globalScore), 10);
    return Math.max(1, Math.floor(lo - 0.25));
  }, [bias.points]);

  const t = bias.threshold;
  const harsh = bias.harshness;

  const renderDot = ({ cx = 0, cy = 0, payload }: DotProps) => {
    if (!payload) return <g />;
    const dim = focus !== "all" && payload.kind !== focus;
    const active = payload.key === hovered;
    const color = KIND_COLOR[payload.kind];
    const r = active ? 7 : payload.kind === "aligned" ? 3.5 : 4.5;
    const opacity = dim ? 0.12 : payload.kind === "aligned" ? 0.55 : 0.9;
    const common = { fill: color, fillOpacity: opacity, stroke: active ? "var(--foreground)" : color, strokeOpacity: active ? 1 : opacity, strokeWidth: active ? 2 : 1 };
    return payload.medium === "manga" ? (
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} {...common} />
    ) : (
      <circle cx={cx} cy={cy} r={r} {...common} />
    );
  };

  return (
    <Panel
      icon={Crosshair}
      title="Taste & bias"
      subtitle={`Your score vs the MAL community score. Points beyond ±${t} of the diagonal are hidden gems or overrated picks.`}
      actions={
        <Segmented
          label="Highlight"
          value={focus}
          onChange={setFocus}
          options={[
            { value: "all", label: "All" },
            { value: "gem", label: `Hidden gems · ${bias.gems.length}` },
            { value: "overrated", label: `Overrated · ${bias.overrated.length}` },
          ]}
        />
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat
          label="Rating harshness"
          value={signed(harsh)}
          tone={harsh === null ? undefined : harsh >= 0 ? "up" : "down"}
          hint={harsh === null ? "No paired scores" : harsh >= 0 ? "Kinder than the community" : "Harsher than the community"}
        />
        <Stat label="Mean |Δ|" value={fmt(bias.meanAbsDelta)} hint="Average distance from MAL" />
        <Stat label="Agreement" value={bias.correlation === null ? "—" : `r = ${bias.correlation.toFixed(2)}`} hint="Pearson correlation" />
        <Stat label="Scored titles" value={nf.format(bias.points.length)} hint={`${bias.gems.length} gems · ${bias.overrated.length} overrated`} />
      </div>

      {bias.points.length === 0 ? (
        <EmptyChart>No titles with both your score and a MAL score match these filters.</EmptyChart>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="h-[26rem]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="globalScore"
                  name="MAL score"
                  domain={[xMin, 10]}
                  tickCount={10 - xMin + 1}
                  allowDecimals={false}
                  tick={CHART.tick}
                  stroke={CHART.grid}
                  label={{ value: "MAL community score", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey={(p: ScorePoint) => p.userScore + p.jitter}
                  name="Your score"
                  domain={[0.5, 10.5]}
                  ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                  tick={CHART.tick}
                  stroke={CHART.grid}
                  width={44}
                  label={{ value: "Your score", angle: -90, position: "insideLeft", offset: 12, fill: "var(--muted)", fontSize: 11 }}
                />
                <ReferenceLine
                  segment={[{ x: xMin, y: xMin + t }, { x: 10 - t, y: 10 }]}
                  stroke={CHART.emerald}
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                  ifOverflow="hidden"
                />
                <ReferenceLine
                  segment={[{ x: xMin + t, y: xMin }, { x: 10, y: 10 - t }]}
                  stroke={CHART.rose}
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                  ifOverflow="hidden"
                />
                <ReferenceLine
                  segment={[{ x: xMin, y: xMin }, { x: 10, y: 10 }]}
                  stroke="var(--foreground)"
                  strokeOpacity={0.5}
                  strokeWidth={1.5}
                  ifOverflow="hidden"
                  label={{ value: "y = x", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }}
                />
                <Tooltip cursor={false} isAnimationActive={false} content={<PointTooltip />} />
                <Scatter
                  data={bias.points}
                  shape={renderDot}
                  isAnimationActive={false}
                  onClick={(d: { payload?: ScorePoint }) => d.payload?.url && window.open(d.payload.url, "_blank", "noopener")}
                  className="cursor-pointer"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <Legend combined={mode === "combined"} />
          </div>
          <div className="space-y-4">
            <PickList title="Hidden gems" icon={Gem} tone="up" points={bias.gems} onHover={setHovered} />
            <PickList title="Overrated" icon={ThumbsDown} tone="down" points={bias.overrated} onHover={setHovered} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function Legend({ combined }: { combined: boolean }) {
  const item = (color: string, label: string, diamond = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("inline-block size-2.5", diamond ? "rotate-45" : "rounded-full")} style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="-mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
      {item(CHART.emerald, "Hidden gem")}
      {item(CHART.violet, "Aligned")}
      {item(CHART.rose, "Overrated")}
      {combined && (
        <>
          <span className="text-card-border">|</span>
          {item("var(--muted)", "Anime")}
          {item("var(--muted)", "Manga", true)}
        </>
      )}
    </div>
  );
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScorePoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <TooltipCard>
      <div className="flex w-64 gap-3">
        {p.imageUrl ? (
          <Image src={p.imageUrl} alt="" width={56} height={80} className="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-card-border" />
        ) : (
          <div className="h-20 w-14 shrink-0 rounded-lg bg-foreground/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold text-foreground">{p.title}</p>
          <p className="mt-0.5 text-[10px] tracking-wide text-muted uppercase">{p.medium}</p>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center tabular-nums">
            <div>
              <div className="text-[10px] text-muted">You</div>
              <div className="font-semibold">{p.userScore}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">MAL</div>
              <div className="font-semibold">{p.globalScore.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Δ</div>
              <div className="font-semibold" style={{ color: KIND_COLOR[p.kind] }}>
                {signed(p.delta)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipCard>
  );
}

function PickList({
  title,
  icon: Icon,
  tone,
  points,
  onHover,
}: {
  title: string;
  icon: typeof Gem;
  tone: "up" | "down";
  points: ScorePoint[];
  onHover: (key: string | null) => void;
}) {
  return (
    <div>
      <h3 className={clsx("mb-2 flex items-center gap-1.5 text-xs font-semibold", tone === "up" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
        <Icon className="size-3.5" />
        {title}
      </h3>
      {points.length === 0 ? (
        <p className="text-xs text-muted">None in this view.</p>
      ) : (
        <ul className="space-y-1">
          {points.slice(0, 5).map((p) => (
            <li key={p.key}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => onHover(p.key)}
                onMouseLeave={() => onHover(null)}
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition hover:bg-foreground/5"
              >
                {p.imageUrl ? (
                  <Image src={p.imageUrl} alt="" width={28} height={40} className="h-10 w-7 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-10 w-7 shrink-0 rounded-md bg-foreground/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{p.title}</p>
                  <p className="text-[11px] text-muted tabular-nums">
                    {p.userScore} vs {p.globalScore.toFixed(2)}
                  </p>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    tone === "up" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300",
                  )}
                >
                  {signed(p.delta, 1)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
