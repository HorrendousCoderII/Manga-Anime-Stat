"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowRight, AtSign, CheckCircle2, Clock, Loader2, Sparkles, Star, Tags } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useUserData, type EnrichmentState } from "@/hooks/use-user-data";
import { computeKpis, type KpiSummary } from "@/lib/stats";
import type { ListSource } from "@/lib/server/data-sources";
import type { ListEntry, MediumMode, UserProfile } from "@/lib/types";
import { Insights } from "./insights/insights";
import { KpiCard } from "./kpi-card";
import { MediumSwitcher } from "./medium-switcher";
import { ThemeToggle } from "./theme-toggle";

const EXAMPLES = ["Xinil", "Kineta", "Archaeon"];
const nf = new Intl.NumberFormat("en-US");
const fmtScore = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const pct = (n: number) => `${Math.round(n * 100)}%`;

function parseMode(v: string | null): MediumMode {
  return v === "manga" || v === "combined" ? v : "anime";
}

export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const username = params.get("u");
  const mode = parseMode(params.get("m"));
  const [draft, setDraft] = useState(username ?? "");

  const { state, error, data, entries, enrichment, profile, profileError, profileLoading } = useUserData(username, mode === "manga" ? "manga" : "anime");
  const kpis = useMemo(
    () => (state === "ready" ? computeKpis(entries, mode, profile?.statistics ?? null) : null),
    [state, entries, mode, profile],
  );

  const navigate = (next: { u?: string | null; m?: MediumMode }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.u) sp.set("u", next.u);
    else if (next.u === null) sp.delete("u");
    if (next.m) sp.set("m", next.m);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const submit = (e?: FormEvent, name = draft) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      setDraft(trimmed);
      navigate({ u: trimmed });
    }
  };

  const loading = state === "loading";

  return (
    <div className="relative min-h-screen">
      <div className="backdrop-glow pointer-events-none fixed inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 text-white shadow-lg shadow-fuchsia-600/30">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Manga·Anime Stat</h1>
              <p className="text-xs text-muted">MyAnimeList analytics dashboard</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <section className="rounded-3xl border border-card-border bg-card p-5 shadow-sm backdrop-blur sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <form onSubmit={submit} className="flex-1">
              <label htmlFor="username" className="text-sm font-medium text-muted">
                MyAnimeList username
              </label>
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <AtSign className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                  <input
                    id="username"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="e.g. Xinil"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={16}
                    className="h-11 w-full rounded-xl border border-card-border bg-background/60 pr-3 pl-10 text-sm transition outline-none placeholder:text-muted/70 focus:border-violet-500/60 focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !draft.trim()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                  Analyze
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                Try:
                {EXAMPLES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => submit(undefined, name)}
                    className="rounded-full border border-card-border px-2.5 py-0.5 transition hover:border-violet-500/50 hover:text-foreground"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </form>
            <MediumSwitcher value={mode} onChange={(m) => navigate({ m })} />
          </div>
        </section>

        {state === "error" && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {state === "idle" && <EmptyState />}

        {(loading || state === "ready") && (
          <>
            <ProfileBar
              username={username!}
              profile={profile}
              profileLoading={profileLoading}
              loading={loading}
              enrichment={enrichment}
              listErrors={data?.listErrors ?? {}}
              listSources={data?.listSources ?? {}}
              fallbackReasons={data?.fallbackReasons ?? {}}
              profileError={profileError}
            />
            <KpiGrid kpis={kpis} loading={loading} enrichment={enrichment} />
            {kpis && <TopRated entries={entries} mode={mode} />}
            {kpis && <Insights key={username} entries={entries} mode={mode} />}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 grid place-items-center rounded-3xl border border-dashed border-card-border px-6 py-20 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-pink-500/20 text-violet-600 dark:text-violet-300">
        <Sparkles className="size-6" />
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Look up any public MyAnimeList profile</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        See completed titles, how your scores compare to the community, total time spent, and your most-watched
        genres, studios and magazines.
      </p>
    </div>
  );
}

function ProfileBar({
  username,
  profile,
  profileLoading,
  loading,
  enrichment,
  listErrors,
  listSources,
  fallbackReasons,
  profileError,
}: {
  username: string;
  profile: UserProfile | null;
  profileLoading: boolean;
  loading: boolean;
  enrichment: EnrichmentState;
  listErrors: Record<string, string>;
  listSources: Record<string, ListSource>;
  fallbackReasons: Record<string, string>;
  profileError: string | null;
}) {
  const sources = Object.entries(listSources);
  const progress = enrichment.total ? enrichment.done / enrichment.total : 0;
  return (
    <section className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {profile?.imageUrl ? (
          <Image src={profile.imageUrl} alt="" width={48} height={48} className="size-12 rounded-2xl object-cover ring-1 ring-card-border" />
        ) : (
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-pink-500/25 text-lg font-semibold uppercase">
            {username[0]}
          </div>
        )}
        <div>
          <a
            href={profile?.url ?? `https://myanimelist.net/profile/${username}`}
            target="_blank"
            rel="noreferrer"
            className="text-lg font-semibold tracking-tight hover:underline"
          >
            {profile?.username ?? username}
          </a>
          <p className="text-xs text-muted">
            {loading
              ? "Fetching lists…"
              : profile?.joined
                ? `Joined ${new Date(profile.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                : "MyAnimeList member"}
          </p>
        </div>
      </div>

      {!loading && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(listErrors).map(([medium, msg]) => (
            <Badge key={medium} tone="warn" title={msg}>
              {medium} list unavailable
            </Badge>
          ))}
          {sources.length > 0 &&
            (sources.every(([, src]) => src === "mal-api") ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" />
                MAL API v2
              </Badge>
            ) : (
              <Badge tone="warn" title={Object.values(fallbackReasons).join(" · ") || undefined}>
                Fallback: MAL list feed
              </Badge>
            ))}
          {enrichment.upstreamDown ? (
            <Badge tone="warn">Title details unavailable</Badge>
          ) : enrichment.running ? (
            <Badge tone="info">
              <Loader2 className="size-3 animate-spin" />
              Loading title details {enrichment.done}/{enrichment.total}
              <span className="ml-1 h-1 w-16 overflow-hidden rounded-full bg-current/15">
                <span className="block h-full rounded-full bg-current" style={{ width: pct(progress) }} />
              </span>
            </Badge>
          ) : (
            enrichment.total > 0 && (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" />
                {enrichment.total} titles enriched
              </Badge>
            )
          )}
          {profileError && !profileLoading && (
            <Badge tone="warn" title={profileError}>
              Profile stats unavailable (Jikan)
            </Badge>
          )}
        </div>
      )}
    </section>
  );
}

function Badge({ tone, title, children }: { tone: "ok" | "info" | "warn"; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "info" && "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {children}
    </span>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className={clsx(
        "ml-2 rounded-full px-2 py-0.5 align-middle text-sm font-semibold",
        up ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300",
      )}
    >
      {up ? "+" : "−"}
      {Math.abs(delta).toFixed(2)}
    </span>
  );
}

function KpiGrid({ kpis, loading, enrichment }: { kpis: KpiSummary | null; loading: boolean; enrichment: EnrichmentState }) {
  const k = kpis;
  const creditLine = (label: string, credit: KpiSummary["topStudio"]) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="truncate font-medium text-foreground">
        {credit ? `${credit.name} · ${credit.count}` : enrichment.upstreamDown ? "Unavailable" : enrichment.running ? "Loading…" : "—"}
      </span>
    </div>
  );
  const coverage = [k?.topStudio?.coverage, k?.topMagazine?.coverage].filter((c): c is number => c !== undefined);

  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Titles Completed"
        icon={CheckCircle2}
        accent="violet"
        loading={loading || !k}
        value={k && nf.format(k.completed)}
        sub={k && `of ${nf.format(k.totalEntries)} on list`}
        footer={k && k.totalEntries > 0 && `${pct(k.completed / k.totalEntries)} completion rate`}
      />
      <KpiCard
        label="Mean Score vs Global"
        icon={Star}
        accent="pink"
        loading={loading || !k}
        value={
          k && (
            <>
              {fmtScore(k.score.meanUser)}
              <DeltaPill delta={k.score.delta} />
            </>
          )
        }
        sub={k && `vs ${fmtScore(k.score.meanGlobal)} MAL community`}
        footer={
          k &&
          (k.score.delta === null
            ? "No scored titles yet"
            : `${k.score.delta >= 0 ? "Kinder" : "Harsher"} than average across ${nf.format(k.score.paired)} scored titles`)
        }
      />
      <KpiCard
        label={k?.mode === "manga" ? "Chapters & Volumes Read" : k?.mode === "combined" ? "Time & Reading" : "Total Watch Time"}
        icon={Clock}
        accent="sky"
        loading={loading || !k}
        value={
          k &&
          (k.watch ? (
            <>
              {nf.format(Math.round(k.watch.hours))}
              <span className="ml-1 text-lg font-medium text-muted">hrs</span>
            </>
          ) : (
            <>
              {nf.format(k.read?.chapters ?? 0)}
              <span className="ml-1 text-lg font-medium text-muted">ch</span>
            </>
          ))
        }
        sub={
          k &&
          (k.watch
            ? k.read
              ? `${nf.format(k.read.chapters)} chapters · ${nf.format(k.read.volumes)} volumes`
              : `≈ ${(k.watch.hours / 24).toFixed(1)} days · ${nf.format(k.watch.episodes)} episodes`
            : `${nf.format(k.read?.volumes ?? 0)} volumes`)
        }
        footer={
          k?.watch &&
          (k.watch.source === "profile"
            ? "Watch time from MAL profile statistics"
            : k.watch.estimatedShare > 0
              ? `Estimated · ${pct(k.watch.estimatedShare)} of titles assume 24 min/ep`
              : "Computed from episode runtimes")
        }
      />
      <KpiCard
        label={k?.mode === "anime" ? "Top Genre & Studio" : k?.mode === "manga" ? "Top Genre & Magazine" : "Top Genre & Credits"}
        icon={Tags}
        accent="amber"
        loading={loading || !k}
        value={<span className="block truncate">{k?.topGenre?.name ?? "—"}</span>}
        sub={
          k && (
            <div className="space-y-1">
              {k.topGenre && (
                <div>
                  {nf.format(k.topGenre.count)} titles · {pct(k.topGenre.share)} of completed
                </div>
              )}
              <div className="space-y-0.5 pt-1 text-xs">
                {k.mode !== "manga" && creditLine("Studio", k.topStudio)}
                {k.mode !== "anime" && creditLine("Magazine", k.topMagazine)}
              </div>
            </div>
          )
        }
        footer={coverage.length > 0 && `Credits from ${pct(Math.min(...coverage))} of completed titles`}
      />
    </div>
  );
}

function TopRated({ entries, mode }: { entries: ListEntry[]; mode: MediumMode }) {
  const top = entries
    .filter((e) => (mode === "combined" || e.media.medium === mode) && e.userScore !== null && e.media.imageUrl)
    .sort((a, b) => b.userScore! - a.userScore! || (b.media.score ?? 0) - (a.media.score ?? 0))
    .slice(0, 8);
  if (!top.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-muted">Your highest rated</h2>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {top.map((e) => (
          <a
            key={`${e.media.medium}-${e.media.malId}`}
            href={e.media.url}
            target="_blank"
            rel="noreferrer"
            title={e.media.title}
            className="group relative aspect-[2/3] overflow-hidden rounded-2xl border border-card-border bg-card"
          >
            <Image src={e.media.imageUrl!} alt={e.media.title} fill sizes="140px" className="object-cover transition duration-300 group-hover:scale-105" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-8">
              <p className="line-clamp-2 text-[11px] leading-tight font-medium text-white">{e.media.title}</p>
              <p className="mt-0.5 text-[10px] text-white/75 tabular-nums">
                ★ {e.userScore} · MAL {e.media.score?.toFixed(2) ?? "—"}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
