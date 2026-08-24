import type { CSSProperties } from "react";
import { getArtworkUrl } from "../artwork";
import type { Song } from "../song-context";

export function SongCard({ song }: { song: Song }) {
  const imageUrl = getArtworkUrl(song);

  return (
    <div
      className="song-card"
      style={
        {
          "--song-art": `url(${imageUrl})`,
        } as CSSProperties
      }
    >
      <span className="song-card-track-number">
        {String(song.trackIndex).padStart(2, "0")}
      </span>
      <img
        className="song-card-artwork"
        src={imageUrl}
        alt=""
        draggable={false}
      />
      <div className="song-card-copy">
        <h2>{song.title}</h2>
        <p>{song.location}</p>
      </div>
    </div>
  );
}
