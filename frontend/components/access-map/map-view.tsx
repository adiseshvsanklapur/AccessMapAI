"use client";

import dynamic from "next/dynamic";
import type { AccessibilityMapProps } from "./types";

const MapboxImplementation = dynamic(
  () =>
    import(/* webpackChunkName: "mapbox-map" */ "./mapbox-map").then((mod) => ({
      default: mod.AccessibilityMapboxMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[22rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card text-muted-foreground text-sm">
        <span
          aria-hidden
          className="size-8 animate-pulse rounded-full bg-primary/20 ring-2 ring-primary/15"
        />
        <span className="font-medium text-xs tracking-wide">Loading map…</span>
      </div>
    ),
  }
);

export function MapView(props: AccessibilityMapProps) {
  return (
    <div className="group/map relative h-full min-h-[18rem] w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[0_28px_64px_-40px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.04]">
      <MapboxImplementation {...props} />
    </div>
  );
}
