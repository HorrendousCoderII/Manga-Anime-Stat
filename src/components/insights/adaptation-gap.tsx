"use client";

import clsx from "clsx";
import { ArrowLeftRight, BookOpen, Clapperboard } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeAdaptationGaps,
  scopeForGaps,
  type AdaptationPair,
} from "@/lib/analytics/adaptation-gap";
import { useAdaptationRelations } from "@/hooks/use-adaptation-relations";
import type { ListEntry, MediumMode } from "@/lib/types";
import { CHART, EmptyChart, Panel, Segmented, Stat, TooltipCard, fmt, nf, signed } from "./ui";

type View = "bars" | "scatter";

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: AdaptationPair;
}

export function AdaptationGap({
  entries,
  filtered,
  mode,
}: {
  /** Full user lists (both media) — counterparts for Anime/Manga modes. */
  entries: ListEntry[];
  /** Chart-filter-scoped entries for the active medium mode. */
  filtered: ListEntry[];
  mode: MediumMode;
}) {
  const [view, setView] = useState<View>("bars");
  const [hovered, setHovered] = useState<string | null>(null);

  const scoped = useMemo(() => scopeForGaps(entries, filtered, mode), [entries, filtered, mode]);
  const { map: relations, done, total, running } = useAdaptationRelations(scoped, filtered.length > 0);
  const gap = useMemo(() => computeAdaptationGaps(scoped, relations), [scoped, relations]);

  const chartPairs = gap.pairs.slice(0, 16);
  const barData = useMemo(
    () =>
      [...chartPairs].reverse().map((p) => ({
        ...p,
        label: p.seriesTitle.length > 28 ? `${p.seriesTitle.slice(0, 26)}…` : p.seriesTitle,
      })),
    [chartPairs],
  );

  const subtitle =
    mode === "combined"
      ? "Manga vs anime community scores for titles that appear on both of your lists."
      : mode === "anime"
        ? "Anime on this view paired with manga also on your list (via relations or title)."
        : "Manga on this view paired with anime also on your list (via relations or title).";

  return (
    <Panel
      icon={ArrowLeftRight}
      title="Adaptation gap"
      subtitle={
        <>
          {subtitle}{" "}
          {running
            ? `Resolving relations ${done}/${total}…`
            : total > 0
              ? `${gap.relationPairs} relation · ${gap.titlePairs} title pairs.`
              : null}
        </>
      }
      actions={
        <Segmented
          label="Chart type"
          value={view}
          onChange={setView}
          options={[
            { value: "bars", label: "Paired bars" },
            { value: "scatter", label: "Delta scatter" },
          ]}
        />
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Paired series" value={nf.format(gap.pairs.length)} hint="With scores on both sides" />
        <Stat
          label="Mean gap"
          value={signed(gap.meanDelta)}
          tone={gap.meanDelta === null ? undefined : gap.meanDelta >= 0 ? "up" : "down"}
          hint="Manga − anime (MAL score)"
        />
        <Stat label="Mean |Δ|" value={fmt(gap.meanAbsDelta)} hint="Average absolute gap" />
        <Stat
          label="Who wins"
          value={
            gap.pairs.length === 0 ? "—" : (
              <span className="text-base">
                <span className="text-emerald-600 dark:text-emerald-300">{gap.mangaWins} manga</span>
                <span className="mx-1 text-muted">·</span>
                <span className="text-sky-600 dark:text-sky-300">{gap.animeWins} anime</span>
              </span>
            )
          }
          hint={gap.ties ? `${gap.ties} tied` : "By community score"}
        />
      </div>

      {gap.pairs.length === 0 ? (
        <EmptyChart>
          {filtered.length === 0
            ? "No titles match these filters."
            : mode === "combined"
              ? "No overlapping manga/anime adaptations found on both lists yet. Try a user who tracks both media."
              : "No adaptation pairs found. The counterpart medium needs to be on the list too."}
        </EmptyChart>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="h-[26rem]">
            {view === "bars" ? <PairedBars data={barData} /> : <DeltaScatter pairs={chartPairs} hovered={hovered} />}
          </div>
          <GapList pairs={gap.pairs} onHover={setHovered} />
        </div>
      )}
    </Panel>
  );
}

function PairedBars({ data }: { data: (AdaptationPair & { label: string })[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={CHART.tick} stroke={CHART.grid} />
        <YAxis type="category" dataKey="label" width={118} tick={CHART.tick} stroke={CHART.grid} interval={0} />
        <Tooltip cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }} content={<PairTooltip />} />
        <Bar dataKey="manga.score" name="Manga" fill={CHART.emerald} radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
        <Bar dataKey="anime.score" name="Anime" fill={CHART.sky} radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DeltaScatter({ pairs, hovered }: { pairs: AdaptationPair[]; hovered: string | null }) {
  const renderDot = ({ cx = 0, cy = 0, payload }: DotProps) => {
    if (!payload) return <g />;
    const active = payload.key === hovered;
    const color = payload.delta >= 0 ? CHART.emerald : CHART.rose;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={active ? 7 : 5}
        fill={color}
        fillOpacity={0.85}
        stroke={active ? "var(--foreground)" : color}
        strokeWidth={active ? 2 : 1}
      />
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="anime.score"
          name="Anime"
          domain={[5, 10]}
          tick={CHART.tick}
          stroke={CHART.grid}
          label={{ value: "Anime MAL score", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="manga.score"
          name="Manga"
          domain={[5, 10]}
          tick={CHART.tick}
          stroke={CHART.grid}
          width={44}
          label={{ value: "Manga MAL score", angle: -90, position: "insideLeft", offset: 12, fill: "var(--muted)", fontSize: 11 }}
        />
        <ReferenceLine
          segment={[{ x: 5, y: 5 }, { x: 10, y: 10 }]}
          stroke="var(--foreground)"
          strokeOpacity={0.45}
          strokeDasharray="4 4"
          ifOverflow="hidden"
          label={{ value: "equal", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }}
        />
        <Tooltip cursor={false} isAnimationActive={false} content={<PairTooltip />} />
        <Scatter
          data={pairs}
          shape={renderDot}
          isAnimationActive={false}
          onClick={(d: { payload?: AdaptationPair }) => d.payload?.manga.url && window.open(d.payload.manga.url, "_blank", "noopener")}
          className="cursor-pointer"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function PairTooltip({ active, payload }: { active?: boolean; payload?: { payload: AdaptationPair }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <TooltipCard>
      <div className="w-64">
        <p className="font-semibold text-foreground">{p.seriesTitle}</p>
        <p className="mt-0.5 text-[10px] tracking-wide text-muted uppercase">
          {p.matchSource === "relation" ? p.relation : "Title match"}
        </p>
        <div className="mt-2 flex gap-2">
          <Thumb side="Manga" item={p.manga} color={CHART.emerald} />
          <Thumb side="Anime" item={p.anime} color={CHART.sky} />
        </div>
        <p className="mt-2 text-center text-[11px] tabular-nums">
          Gap{" "}
          <span className="font-semibold" style={{ color: p.delta >= 0 ? CHART.emerald : CHART.rose }}>
            {signed(p.delta)}
          </span>{" "}
          (manga − anime)
        </p>
      </div>
    </TooltipCard>
  );
}

function Thumb({
  side,
  item,
  color,
}: {
  side: string;
  item: AdaptationPair["anime"];
  color: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-2">
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt="" width={36} height={52} className="h-[52px] w-9 shrink-0 rounded-md object-cover ring-1 ring-card-border" />
      ) : (
        <div className="h-[52px] w-9 shrink-0 rounded-md bg-foreground/10" />
      )}
      <div className="min-w-0">
        <div className="text-[10px] font-medium" style={{ color }}>
          {side}
        </div>
        <p className="line-clamp-2 text-[11px] leading-tight">{item.title}</p>
        <p className="text-[11px] tabular-nums text-muted">★ {item.score.toFixed(2)}</p>
      </div>
    </div>
  );
}

function GapList({ pairs, onHover }: { pairs: AdaptationPair[]; onHover: (key: string | null) => void }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <ArrowLeftRight className="size-3.5" />
        Largest gaps
      </h3>
      <ul className="space-y-1">
        {pairs.slice(0, 8).map((p) => {
          const mangaAhead = p.delta >= 0;
          return (
            <li key={p.key}>
              <a
                href={p.manga.url || p.anime.url}
                target="_blank"
                rel="noreferrer"
                onMouseEnter={() => onHover(p.key)}
                onMouseLeave={() => onHover(null)}
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-foreground/5"
              >
                <div className="relative h-10 w-7 shrink-0">
                  {p.manga.imageUrl ? (
                    <Image src={p.manga.imageUrl} alt="" fill sizes="28px" className="rounded-md object-cover" />
                  ) : (
                    <div className="h-full rounded-md bg-foreground/10" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{p.seriesTitle}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted tabular-nums">
                    <BookOpen className="size-3 text-emerald-500" />
                    {p.manga.score.toFixed(2)}
                    <span className="text-card-border">→</span>
                    <Clapperboard className="size-3 text-sky-500" />
                    {p.anime.score.toFixed(2)}
                  </p>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    mangaAhead
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-300",
                  )}
                >
                  {signed(p.delta, 2)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.emerald }} /> Manga
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: CHART.sky }} /> Anime
        </span>
      </div>
    </div>
  );
}
