"use client";

import { useCallback, useEffect, useState } from "react";
import { parseGridLayouts, serializeGridLayouts, type GridLayouts } from "@/lib/widget-grid";

// Per device on purpose, like the widget order: the kitchen iPad and a phone
// want different arrangements.
const KEY = "kinboard.widget-grid";
const EVENT = "kinboard:widget-grid-change";

function read(): GridLayouts | null {
  if (typeof window === "undefined") return null;
  try {
    return parseGridLayouts(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** The saved free-form layout, or null while the classic automatic grid is in use. */
export function useWidgetGrid(): {
  layouts: GridLayouts | null;
  loaded: boolean;
  save: (layouts: GridLayouts) => void;
  reset: () => void;
} {
  const [layouts, setLayouts] = useState<GridLayouts | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const update = () => setLayouts(read());
    update();
    setLoaded(true);
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const save = useCallback((next: GridLayouts) => {
    try {
      window.localStorage.setItem(KEY, serializeGridLayouts(next));
    } catch {
      /* storage full or blocked: the layout just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { layouts, loaded, save, reset };
}
