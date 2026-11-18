export type YouTubeKind = "video" | "playlist";

export interface YouTubeRef {
  kind: YouTubeKind;
  id: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * Accept what people actually paste: watch / youtu.be / shorts / embed / live
 * links, playlist links, or a bare 11-character video id. Returns null for
 * anything else, including other hosts, so nothing unexpected is ever embedded.
 */
export function parseYouTubeInput(input: string): YouTubeRef | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return { kind: "video", id: raw };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const list = url.searchParams.get("list");
  const asPlaylist = (): YouTubeRef | null =>
    list && PLAYLIST_ID.test(list) ? { kind: "playlist", id: list } : null;

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return VIDEO_ID.test(id) ? { kind: "video", id } : asPlaylist();
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "playlist") return asPlaylist();
    const v = url.searchParams.get("v");
    if (parts[0] === "watch" && v && VIDEO_ID.test(v)) return { kind: "video", id: v };
    if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "") && VIDEO_ID.test(parts[1] ?? "")) {
      return { kind: "video", id: parts[1] };
    }
    if (parts[0] === "embed" && parts[1] === "videoseries") return asPlaylist();
  }
  return null;
}

/** Privacy-enhanced embed URL (no cookies until the person plays). */
export function embedUrl(ref: YouTubeRef, autoplay = true): string {
  const params = new URLSearchParams({ playsinline: "1", rel: "0", modestbranding: "1" });
  if (autoplay) params.set("autoplay", "1");
  if (ref.kind === "playlist") {
    params.set("list", ref.id);
    return `https://www.youtube-nocookie.com/embed/videoseries?${params}`;
  }
  return `https://www.youtube-nocookie.com/embed/${ref.id}?${params}`;
}

/** Videos have a stable thumbnail URL; playlists do not, so they get an icon instead. */
export function thumbnailUrl(ref: YouTubeRef): string | null {
  return ref.kind === "video" ? `https://i.ytimg.com/vi/${ref.id}/mqdefault.jpg` : null;
}
