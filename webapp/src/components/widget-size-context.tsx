"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type WidgetTier = "compact" | "medium" | "large";

export interface WidgetSize {
  width: number;
  height: number;
  tier: WidgetTier;
}

/**
 * Size of the grid cell a widget sits in. Null outside the free-form grid, so
 * every widget keeps its fixed, classic behaviour there.
 */
const WidgetSizeContext = createContext<WidgetSize | null>(null);

export function tierFor(width: number, height: number): WidgetTier {
  if (height < 240 || width < 220) return "compact";
  if (height >= 400 && width >= 380) return "large";
  return "medium";
}

// Sizes are rounded so a resize drag does not re-render the widget on every pixel.
const STEP = 8;

/** The grid cell wrapper: measures itself and tells the widget inside how much room it has. */
export function WidgetSizeProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = Math.round(el.clientWidth / STEP) * STEP;
      const height = Math.round(el.clientHeight / STEP) * STEP;
      setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const value = useMemo<WidgetSize | null>(
    () => (box ? { ...box, tier: tierFor(box.width, box.height) } : null),
    [box],
  );

  return (
    <WidgetSizeContext.Provider value={value}>
      <div ref={ref} className="kb-cell" data-tier={value?.tier}>
        {children}
      </div>
    </WidgetSizeContext.Provider>
  );
}

export function useWidgetSize(): WidgetSize | null {
  return useContext(WidgetSizeContext);
}

/** Space a card spends on padding, header and a "N more" footer, in px. */
const CARD_CHROME = 120;

/**
 * How many list rows fit the cell. Outside the grid (or before the cell has
 * been measured) it returns `base`, the widget's own fixed count.
 */
export function useFitCount(base: number, rowPx: number, chrome = CARD_CHROME): number {
  const size = useContext(WidgetSizeContext);
  if (!size) return base;
  return Math.max(1, Math.min(30, Math.floor((size.height - chrome) / rowPx)));
}
