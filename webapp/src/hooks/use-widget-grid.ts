"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useSetting, useUpdateSetting } from "@/hooks/use-supabase-queries";
import { useFamilyStore } from "@/stores/family-store";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  EMPTY_GRID_PAYLOAD,
  gridPayload,
  normalizeGridLayouts,
  parseGridLayouts,
  serializeGridLayouts,
  type GridLayouts,
} from "@/lib/widget-grid";

// The family's layout lives in Kinboard's own database (the `settings` table),
// so every device shows the same arrangement. localStorage keeps a copy: the
// first paint does not wait for the network, and an offline panel still has it.
const KEY = "kinboard.widget-grid";
const EVENT = "kinboard:widget-grid-change";
// Pick up a layout saved from another device without a reload.
const REFRESH_MS = 60_000;

function readLocal(): GridLayouts | null {
  if (typeof window === "undefined") return null;
  try {
    return parseGridLayouts(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function writeLocal(layouts: GridLayouts | null) {
  try {
    if (layouts) window.localStorage.setItem(KEY, serializeGridLayouts(layouts));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: the copy just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The saved free-form layout, or null while the classic automatic grid is in use. */
export function useWidgetGrid(): {
  layouts: GridLayouts | null;
  loaded: boolean;
  save: (layouts: GridLayouts) => void;
  reset: () => void;
} {
  const [local, setLocal] = useState<GridLayouts | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);
  const { data: remote, isSuccess } = useSetting<unknown>(SETTINGS_KEYS.widgetGrid, null, {
    refetchInterval: REFRESH_MS,
  });
  const { mutate } = useUpdateSetting<unknown>();
  const queryClient = useQueryClient();
  const { family } = useFamilyStore();

  useEffect(() => {
    const sync = () => setLocal(readLocal());
    sync();
    setLocalLoaded(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // `remote` is null when nothing was ever saved, and the empty pair after a
  // reset. Only the former lets this device's older local layout seed the family.
  const remoteLayouts = useMemo(() => (isSuccess ? normalizeGridLayouts(remote) : null), [isSuccess, remote]);
  const neverSaved = isSuccess && (remote === null || remote === undefined);

  const seeded = useRef(false);
  useEffect(() => {
    if (!isSuccess || !localLoaded) return;
    if (remoteLayouts) {
      // Keep the offline copy in step with the family's layout.
      if (JSON.stringify(gridPayload(remoteLayouts)) !== JSON.stringify(local && gridPayload(local))) {
        writeLocal(remoteLayouts);
      }
    } else if (neverSaved && local && !seeded.current) {
      // Customised before layouts were shared: promote it once.
      seeded.current = true;
      mutate({ key: SETTINGS_KEYS.widgetGrid, value: gridPayload(local) });
    } else if (!neverSaved && local) {
      // Reset elsewhere: drop the stale copy.
      writeLocal(null);
    }
  }, [isSuccess, localLoaded, remoteLayouts, neverSaved, local, mutate]);

  // Write the new value into the query cache straight away: until the save is
  // confirmed and re-read, the cache still holds the old layout, and the sync
  // effect above would otherwise bring that old copy back for a moment.
  const persist = useCallback(
    (payload: unknown) => {
      if (family?.id) queryClient.setQueryData(queryKeys.settings(family.id, SETTINGS_KEYS.widgetGrid), payload);
      mutate({ key: SETTINGS_KEYS.widgetGrid, value: payload });
    },
    [family?.id, mutate, queryClient],
  );

  const save = useCallback(
    (next: GridLayouts) => {
      writeLocal(next);
      persist(gridPayload(next));
    },
    [persist],
  );

  const reset = useCallback(() => {
    writeLocal(null);
    persist(EMPTY_GRID_PAYLOAD);
  }, [persist]);

  const layouts = isSuccess ? (remoteLayouts ?? (neverSaved ? local : null)) : local;
  return { layouts, loaded: localLoaded && isSuccess, save, reset };
}
