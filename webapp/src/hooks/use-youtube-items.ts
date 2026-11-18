"use client";

import { useCallback, useEffect, useState } from "react";
import type { YouTubeRef } from "@/lib/youtube";

export interface YouTubeItem extends YouTubeRef {
  title: string;
}

// Per device, like the widget layout: the kitchen iPad has its own shortcuts.
const KEY = "kinboard.youtube-items";
const EVENT = "kinboard:youtube-items-change";
const MAX_ITEMS = 24;

function read(): YouTubeItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is YouTubeItem =>
        !!i &&
        (i.kind === "video" || i.kind === "playlist") &&
        typeof i.id === "string" &&
        typeof i.title === "string",
    );
  } catch {
    return [];
  }
}

export function useYouTubeItems() {
  const [items, setItems] = useState<YouTubeItem[]>([]);

  useEffect(() => {
    const update = () => setItems(read());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const write = useCallback((next: YouTubeItem[]) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_ITEMS)));
    } catch {
      /* storage full or blocked: shortcuts just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const add = useCallback(
    (item: YouTubeItem) => {
      const current = read();
      if (current.some((i) => i.kind === item.kind && i.id === item.id)) return;
      write([item, ...current]);
    },
    [write],
  );

  const remove = useCallback(
    (item: YouTubeRef) => write(read().filter((i) => !(i.kind === item.kind && i.id === item.id))),
    [write],
  );

  return { items, add, remove };
}
