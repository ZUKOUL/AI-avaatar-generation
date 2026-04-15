/**
 * Saved Thumbnails — localStorage persistence layer.
 *
 * Thumbnails saved by the user from the Inspiration page (or added manually
 * via YouTube URL) are stored in localStorage as a JSON array. The key is
 * shared across the session so adding from Inspiration is immediately
 * reflected on the Saved page and vice-versa.
 */

export interface SavedThumbnail {
  video_id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
  youtube_url: string;
  added_at: string;
}

const STORAGE_KEY = "horpen_saved_thumbnails";

export function getSavedThumbnails(): SavedThumbnail[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveThumbnail(video: Omit<SavedThumbnail, "added_at">): void {
  const items = getSavedThumbnails();
  if (items.some((i) => i.video_id === video.video_id)) return; // already saved
  items.unshift({ ...video, added_at: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function unsaveThumbnail(videoId: string): void {
  const items = getSavedThumbnails().filter((i) => i.video_id !== videoId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function isThumbnailSaved(videoId: string): boolean {
  return getSavedThumbnails().some((i) => i.video_id === videoId);
}

/** Extract a YouTube video ID from any youtube.com / youtu.be URL variant. */
export function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * Fetch video metadata from YouTube's public oEmbed endpoint (no API key
 * needed, CORS-enabled). Returns null on any failure so callers can degrade
 * gracefully without crashing the UI.
 */
export async function fetchVideoMeta(
  youtubeUrl: string
): Promise<Omit<SavedThumbnail, "added_at"> | null> {
  const videoId = extractYoutubeId(youtubeUrl);
  if (!videoId) return null;
  try {
    const canonical = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      video_id: videoId,
      title: (data.title as string) || "Unknown title",
      channel: (data.author_name as string) || "Unknown channel",
      // oEmbed thumbnail_url is reliable (YouTube guarantees it exists)
      thumbnail_url:
        (data.thumbnail_url as string) ||
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      youtube_url: canonical,
    };
  } catch {
    return null;
  }
}
