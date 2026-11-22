import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  accent: "violet" | "pink" | "sky" | "amber";
  value: ReactNode;
  sub?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
}

const ACCENTS = {
  violet: "from-violet-500/20 to-violet-500/0 text-violet-600 dark:text-violet-300",
  pink: "from-pink-500/20 to-pink-500/0 text-pink-600 dark:text-pink-300",
  sky: "from-sky-500/20 to-sky-500/0 text-sky-600 dark:text-sky-300",
  amber: "from-amber-500/20 to-amber-500/0 text-amber-600 dark:text-amber-300",
};

export function KpiCard({ label, icon: Icon, accent, value, sub, footer, loading }: KpiCardProps) {
  return (
    <section className="group relative flex min-h-44 flex-col overflow-hidden rounded-3xl border border-card-border bg-card p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={clsx("pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br blur-2xl", ACCENTS[accent])} />
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        <span className={clsx("grid size-9 place-items-center rounded-xl bg-gradient-to-br", ACCENTS[accent])}>
          <Icon className="size-4" />
        </span>
      </header>
      {loading ? (
        <div className="mt-5 space-y-3">
          <div className="skeleton h-9 w-2/3 rounded-lg" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
      ) : (
        <>
          <div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
          {sub && <div className="mt-1.5 text-sm text-muted">{sub}</div>}
          {footer && <div className="mt-auto pt-4 text-xs text-muted">{footer}</div>}
        </>
      )}
    </section>
  );
}
