import type { Song } from "./song-context";

const artwork = import.meta.glob("../art/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function getArtworkUrl(song: Song) {
  const sidePrefix = song.side === "Day" ? "d" : "n";

  return artwork[`../art/${sidePrefix}_${song.trackIndex}.jpg`];
}
