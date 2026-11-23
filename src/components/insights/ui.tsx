"use client";

import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { MediumMode } from "@/lib/types";

export const CHART = {
  grid: "var(--card-border)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  violet: "#8b5cf6",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  sky: "#0ea5e9",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
};

export const PALETTE = ["#8b5cf6", "#ec4899", "#0ea5e9", "#f59e0b", "#10b981", "#d946ef", "#6366f1", "#14b8a6", "#f97316"];
export const OTHER_COLOR = "#9b98b0";

export const nf = new Intl.NumberFormat("en-US");
export const fmt = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "—" : n.toFixed(digits));
export const signed = (n: number | null, digits = 2) =>
  n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

/** Time is hours for anime, chapters for manga, and estimated hours when both are mixed. */
export function timeUnit(mode: MediumMode) {
  return mode === "manga"
    ? { key: "chapters" as const, short: "ch", label: "Chapters read" }
    : { key: "hours" as const, short: "h", label: mode === "combined" ? "Hours (manga est.)" : "Hours watched" };
}

export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-3xl border border-card-border bg-card p-5 shadow-sm backdrop-blur sm:p-6", className)}>
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-pink-500/10 text-violet-600 dark:text-violet-300">
            <Icon className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-card-border bg-background/50 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-[10px] px-2.5 py-1 font-medium transition",
            o.value === value ? "bg-foreground text-background shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl border border-card-border bg-background/40 px-3.5 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div
        className={clsx(
          "mt-0.5 text-xl font-semibold tabular-nums",
          tone === "up" && "text-emerald-600 dark:text-emerald-300",
          tone === "down" && "text-rose-600 dark:text-rose-300",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-card-border text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function TooltipCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">{children}</div>
  );
}
