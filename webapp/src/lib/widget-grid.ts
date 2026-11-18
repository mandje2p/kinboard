import type { Layout } from "react-grid-layout";

export type GridBreakpoint = "lg" | "sm";
export type GridLayouts = Record<GridBreakpoint, Layout[]>;

export const GRID_BREAKPOINTS: Record<GridBreakpoint, number> = { lg: 900, sm: 0 };
export const GRID_COLS: Record<GridBreakpoint, number> = { lg: 12, sm: 6 };
export const GRID_ROW_HEIGHT = 40;
export const GRID_MARGIN: [number, number] = [16, 16];

/** Default size per widget on the 12-column grid: [w, h] in grid units. */
const LG_SIZES: Record<string, [number, number]> = {
  weekOverview: [6, 6],
  schedule: [3, 6],
  mealPlan: [3, 6],
  tasks: [3, 6],
  shopping: [3, 6],
  photos: [4, 6],
  media: [4, 5],
  timers: [3, 4],
  messages: [3, 4],
  weather: [3, 5],
};
const DEFAULT_LG: [number, number] = [3, 5];

export function defaultSize(id: string, bp: GridBreakpoint): { w: number; h: number } {
  const [w, h] = LG_SIZES[id] ?? DEFAULT_LG;
  // On the 6-column grid (portrait) a "3" is half the width; wide cards go full.
  return { w: bp === "lg" ? w : Math.min(6, w >= 5 ? 6 : 3), h };
}

/** Pack ids left-to-right, top-to-bottom, starting at row `startY`. */
function flow(ids: string[], bp: GridBreakpoint, startY: number): Layout[] {
  const cols = GRID_COLS[bp];
  const out: Layout[] = [];
  let x = 0;
  let y = startY;
  let rowH = 0;
  for (const id of ids) {
    const { w, h } = defaultSize(id, bp);
    if (x + w > cols) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out.push({ i: id, x, y, w, h, minW: 2, minH: 3 });
    x += w;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/**
 * Reconcile a saved layout with the widgets that are on screen now: drop
 * widgets that are gone, clamp what no longer fits the column count, and
 * append newly enabled widgets below everything else.
 */
export function mergeLayout(saved: Layout[] | undefined, ids: string[], bp: GridBreakpoint): Layout[] {
  const cols = GRID_COLS[bp];
  const byId = new Map((saved ?? []).map((l) => [l.i, l]));
  const kept: Layout[] = [];
  for (const id of ids) {
    const l = byId.get(id);
    if (!l) continue;
    const w = Math.max(1, Math.min(l.w, cols));
    kept.push({ ...l, w, x: Math.max(0, Math.min(l.x, cols - w)), minW: 2, minH: 3 });
  }
  const missing = ids.filter((id) => !byId.has(id));
  const baseY = kept.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  return [...kept, ...flow(missing, bp, baseY)];
}

export function mergeLayouts(saved: GridLayouts | null, ids: string[]): GridLayouts {
  return {
    lg: mergeLayout(saved?.lg, ids, "lg"),
    sm: mergeLayout(saved?.sm, ids, "sm"),
  };
}

export function breakpointForWidth(width: number): GridBreakpoint {
  return width >= GRID_BREAKPOINTS.lg ? "lg" : "sm";
}

const isLayoutItem = (v: unknown): v is Layout => {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.i === "string" &&
    ["x", "y", "w", "h"].every((k) => typeof l[k] === "number" && Number.isFinite(l[k] as number))
  );
};

/** Validate whatever came out of storage; anything odd means "no layout". */
export function parseGridLayouts(raw: string | null): GridLayouts | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: number; lg?: unknown; sm?: unknown };
    if (parsed?.v !== 1 || !Array.isArray(parsed.lg) || !Array.isArray(parsed.sm)) return null;
    return {
      lg: parsed.lg.filter(isLayoutItem).map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
      sm: parsed.sm.filter(isLayoutItem).map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    };
  } catch {
    return null;
  }
}

export function serializeGridLayouts(layouts: GridLayouts): string {
  const slim = (ls: Layout[]) => ls.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return JSON.stringify({ v: 1, lg: slim(layouts.lg), sm: slim(layouts.sm) });
}
