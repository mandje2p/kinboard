"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useSetting, useUpdateSetting } from "@/hooks/use-supabase-queries";
import { useFamilyStore } from "@/stores/family-store";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import type { YouTubeRef } from "@/lib/youtube";

export interface YouTubeItem extends YouTubeRef {
  title: string;
}

// Shortcuts are shared by the whole family (the `settings` table in Kinboard's
// own database). localStorage keeps a copy for the first paint and for offline.
const KEY = "kinboard.youtube-items";
const EVENT = "kinboard:youtube-items-change";
const MAX_ITEMS = 24;
const REFRESH_MS = 60_000;

function sanitize(input: unknown): YouTubeItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (i): i is YouTubeItem =>
        !!i &&
        (i.kind === "video" || i.kind === "playlist") &&
        typeof i.id === "string" &&
        typeof i.title === "string",
    )
    .map(({ kind, id, title }) => ({ kind, id, title }))
    .slice(0, MAX_ITEMS);
}

function readLocal(): YouTubeItem[] {
  if (typeof window === "undefined") return [];
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeLocal(items: YouTubeItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked: the copy just won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

const same = (a: YouTubeRef, b: YouTubeRef) => a.kind === b.kind && a.id === b.id;

export function useYouTubeItems() {
  const [local, setLocal] = useState<YouTubeItem[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);
  const { data: remote, isSuccess } = useSetting<unknown>(SETTINGS_KEYS.youtubeItems, null, {
    refetchInterval: REFRESH_MS,
  });
  const { mutate } = useUpdateSetting<YouTubeItem[]>();
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

  // null = never saved to the family: this device's older list may seed it once.
  const neverSaved = isSuccess && (remote === null || remote === undefined);
  const remoteItems = useMemo(
    () => (isSuccess && remote !== null && remote !== undefined ? sanitize(remote) : null),
    [isSuccess, remote],
  );

  const seeded = useRef(false);
  useEffect(() => {
    if (!isSuccess || !localLoaded) return;
    if (remoteItems) {
      if (JSON.stringify(remoteItems) !== JSON.stringify(local)) writeLocal(remoteItems);
    } else if (neverSaved && local.length > 0 && !seeded.current) {
      seeded.current = true;
      mutate({ key: SETTINGS_KEYS.youtubeItems, value: local });
    }
  }, [isSuccess, localLoaded, remoteItems, neverSaved, local, mutate]);

  const items = remoteItems ?? local;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback(
    (next: YouTubeItem[]) => {
      const trimmed = next.slice(0, MAX_ITEMS);
      itemsRef.current = trimmed;
      writeLocal(trimmed);
      // Cache first, so the stale server copy cannot flash back before the save lands.
      if (family?.id) queryClient.setQueryData(queryKeys.settings(family.id, SETTINGS_KEYS.youtubeItems), trimmed);
      mutate({ key: SETTINGS_KEYS.youtubeItems, value: trimmed });
    },
    [family?.id, mutate, queryClient],
  );

  const add = useCallback(
    (item: YouTubeItem) => {
      if (itemsRef.current.some((i) => same(i, item))) return;
      commit([item, ...itemsRef.current]);
    },
    [commit],
  );

  const remove = useCallback(
    (item: YouTubeRef) => commit(itemsRef.current.filter((i) => !same(i, item))),
    [commit],
  );

  return { items, add, remove };
}
