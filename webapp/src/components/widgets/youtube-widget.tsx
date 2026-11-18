"use client";

import { useState } from "react";
import { ListVideo, Play, Plus, Trash2, X, Youtube } from "lucide-react";
import { useTranslations } from "next-intl";
import { WidgetCard } from "@/components/widget-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWidgetSize } from "@/components/widget-size-context";
import { useYouTubeItems, type YouTubeItem } from "@/hooks/use-youtube-items";
import { embedUrl, parseYouTubeInput, thumbnailUrl, type YouTubeRef } from "@/lib/youtube";

const sameRef = (a: YouTubeRef, b: YouTubeRef) => a.kind === b.kind && a.id === b.id;

/**
 * YouTube on the wall: paste a video or playlist link once, then it is a
 * one-tap shortcut. Plays in an embedded, cookie-less player. Shortcuts live
 * on this device only.
 */
export function YouTubeWidget({ className = "" }: { className?: string }) {
  const t = useTranslations("youtubeWidget");
  const size = useWidgetSize();
  // Classic grid has no cell size: behave like a medium card.
  const tier = size?.tier ?? "medium";
  const { items, add, remove } = useYouTubeItems();
  const [playing, setPlaying] = useState<YouTubeRef | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState(false);
  const [managing, setManaging] = useState(false);

  const submit = () => {
    const ref = parseYouTubeInput(draft);
    if (!ref) {
      setError(true);
      return;
    }
    add({ ...ref, title: title.trim() || (ref.kind === "playlist" ? t("playlist") : t("video")) });
    setDraft("");
    setTitle("");
    setError(false);
    setAdding(false);
    setPlaying(ref);
  };

  const player = playing && (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        // Remount per video so autoplay applies to the new one.
        key={`${playing.kind}:${playing.id}`}
        src={embedUrl(playing)}
        title={t("playerTitle")}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );

  const list = (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <ShortcutRow
          key={`${item.kind}:${item.id}`}
          item={item}
          active={!!playing && sameRef(playing, item)}
          managing={managing}
          onPlay={() => setPlaying(item)}
          onRemove={() => {
            remove(item);
            if (playing && sameRef(playing, item)) setPlaying(null);
          }}
          removeLabel={t("remove")}
          compact={tier === "compact"}
        />
      ))}
    </ul>
  );

  const addForm = adding && (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2 rounded-xl border border-border/50 p-3"
    >
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(false);
        }}
        placeholder={t("urlPlaceholder")}
        aria-label={t("urlPlaceholder")}
        aria-invalid={error}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        autoFocus
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titlePlaceholder")}
        maxLength={60}
      />
      {error && <p className="text-xs text-destructive">{t("invalidUrl")}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setError(false); }}>
          {t("cancel")}
        </Button>
        <Button type="submit" size="sm">{t("addAndPlay")}</Button>
      </div>
    </form>
  );

  const toolbar = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
        <Plus className="size-4" aria-hidden="true" />
        {t("add")}
      </Button>
      {items.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setManaging((v) => !v)}>
          {managing ? t("done") : t("edit")}
        </Button>
      )}
    </div>
  );

  return (
    <WidgetCard icon={Youtube} title={t("title")} className={className}>
      <div className="flex min-h-0 flex-col gap-3">
        {playing && (
          <div className="flex flex-col gap-2">
            {/* Compact cells have no room for a video: a one-line "now playing" bar instead. */}
            {tier === "compact" ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{items.find((i) => sameRef(i, playing))?.title ?? t("video")}</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setPlaying(null)} aria-label={t("close")}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                {player}
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPlaying(null)}>
                    <X className="size-4" aria-hidden="true" />
                    {t("close")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {addForm}
        {items.length === 0 && !adding ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          // Large: the list stays under the player. Medium/compact: playing hides it to keep the video big.
          (tier === "large" || !playing) && <div className="min-h-0 overflow-auto">{list}</div>
        )}
        {toolbar}
      </div>
    </WidgetCard>
  );
}

function ShortcutRow({
  item,
  active,
  managing,
  onPlay,
  onRemove,
  removeLabel,
  compact,
}: {
  item: YouTubeItem;
  active: boolean;
  managing: boolean;
  onPlay: () => void;
  onRemove: () => void;
  removeLabel: string;
  compact: boolean;
}) {
  const thumb = thumbnailUrl(item);
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPlay}
        aria-pressed={active}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-accent/40 ${
          active ? "bg-primary/10" : ""
        }`}
      >
        {!compact && (
          <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {thumb ? (
              <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <ListVideo className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
            <Play className="absolute size-5 text-white drop-shadow" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
      </button>
      {managing && (
        <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={onRemove} aria-label={`${removeLabel}: ${item.title}`}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}
