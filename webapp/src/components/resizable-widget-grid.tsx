"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  GRID_BREAKPOINTS,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  breakpointForWidth,
  mergeLayouts,
  type GridLayouts,
} from "@/lib/widget-grid";

const ResponsiveGrid = WidthProvider(Responsive);

export interface GridItem {
  id: string;
  node: ReactNode;
}

interface Props {
  items: GridItem[];
  /** Saved layouts; null falls back to a computed default. */
  layouts: GridLayouts | null;
  editing: boolean;
  onLayoutsChange: (layouts: GridLayouts) => void;
}

/**
 * Free-form widget grid: drag to move, drag the corner to resize. Outside edit
 * mode it renders the same positions but is inert, so taps reach the widgets.
 */
export default function ResizableWidgetGrid({ items, layouts, editing, onLayoutsChange }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const merged = useMemo(() => mergeLayouts(layouts, ids), [layouts, ids]);
  const mergedRef = useRef(merged);
  mergedRef.current = merged;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const handleLayoutChange = (current: Layout[]) => {
    // react-grid-layout also reports on mount and on every re-compaction;
    // only a person editing should ever write a layout.
    if (!editingRef.current) return;
    const bp = breakpointForWidth(wrapperRef.current?.clientWidth ?? 1024);
    onLayoutsChange({ ...mergedRef.current, [bp]: current });
  };

  return (
    <div ref={wrapperRef} className={editing ? "kb-grid-editing" : undefined}>
      <ResponsiveGrid
        className="kb-grid"
        layouts={merged}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={GRID_ROW_HEIGHT}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        resizeHandles={["se"]}
        compactType="vertical"
        onLayoutChange={handleLayoutChange}
      >
        {items.map((item) => (
          <div key={item.id} className="kb-grid-item">
            <div className="kb-cell">{item.node}</div>
          </div>
        ))}
      </ResponsiveGrid>
    </div>
  );
}
