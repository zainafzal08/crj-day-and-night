import { getArtworkUrl } from "../artwork";
import type { Song } from "../song-context";

export function SongCard({
  song,
  className,
  priority = false,
}: {
  song: Song;
  className?: string;
  priority?: boolean;
}) {
  const imageUrl = getArtworkUrl(song);

  return (
    <div className={`song-card${className ? ` ${className}` : ""}`}>
      <img
        className="song-card-background"
        src={imageUrl}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
      />
      <span className="song-card-track-number">
        {String(song.trackIndex).padStart(2, "0")}
      </span>
      <img
        className="song-card-artwork"
        src={imageUrl}
        alt=""
        decoding="async"
        draggable={false}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
      />
      <div className="song-card-copy">
        <h2>{song.title}</h2>
        <p>{song.location}</p>
      </div>
    </div>
  );
}
