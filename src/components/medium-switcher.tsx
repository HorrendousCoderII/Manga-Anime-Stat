"use client";

import clsx from "clsx";
import { BookOpen, Layers, Tv } from "lucide-react";
import type { MediumMode } from "@/lib/types";

const OPTIONS: { value: MediumMode; label: string; icon: typeof Tv }[] = [
  { value: "anime", label: "Anime", icon: Tv },
  { value: "manga", label: "Manga", icon: BookOpen },
  { value: "combined", label: "Combined", icon: Layers },
];

export function MediumSwitcher({ value, onChange }: { value: MediumMode; onChange: (m: MediumMode) => void }) {
  return (
    <div role="tablist" aria-label="Medium" className="inline-flex rounded-2xl border border-card-border bg-card p-1 backdrop-blur">
      {OPTIONS.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={clsx(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:outline-none",
              active
                ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/25"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
