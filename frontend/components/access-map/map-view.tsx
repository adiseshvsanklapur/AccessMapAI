"use client";

import dynamic from "next/dynamic";
import type { AccessibilityMapProps } from "./types";

const MapboxImplementation = dynamic(
  () =>
    import(/* webpackChunkName: "mapbox-map" */ "./leaflet-map").then((mod) => ({
      default: mod.AccessibilityLeafletMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[22rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-muted/70 text-muted-foreground text-sm">
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
    <div className="group/map relative h-full min-h-[22rem] w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card to-muted/25 shadow-[0_24px_56px_-40px_rgba(92,50,168,0.28),inset_0_1px_0_0_rgba(255,255,255,0.65)] ring-1 ring-black/[0.03] dark:border-border dark:from-card dark:to-background dark:shadow-[0_28px_64px_-40px_rgba(0,0,0,0.75)] dark:ring-white/[0.06] dark:[box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <MapboxImplementation {...props} />
    </div>
  );
}
