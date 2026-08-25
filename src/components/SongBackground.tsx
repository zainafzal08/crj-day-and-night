import { useEffect, useRef, useState } from "react";
import { getArtworkUrl } from "../artwork";
import { useSong } from "../song-context";

const BACKGROUND_TRANSITION_MS = 500;

export function SongBackground({ onReady }: { onReady?: () => void }) {
  const { currentSong } = useSong();
  const artworkUrl = currentSong ? getArtworkUrl(currentSong) : null;
  const [frontArtwork, setFrontArtwork] = useState(artworkUrl);
  const [backArtwork, setBackArtwork] = useState(artworkUrl);
  const [isFading, setIsFading] = useState(false);
  const initialArtworkReady = useRef(false);

  useEffect(() => {
    if (!artworkUrl || initialArtworkReady.current) {
      return;
    }

    let cancelled = false;
    const image = new Image();
    const markReady = () => {
      if (cancelled || initialArtworkReady.current) {
        return;
      }

      initialArtworkReady.current = true;
      onReady?.();
    };

    image.onload = markReady;
    image.onerror = markReady;
    image.fetchPriority = "high";
    image.src = artworkUrl;

    if (image.complete) {
      markReady();
    }

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [artworkUrl, onReady]);

  useEffect(() => {
    if (!artworkUrl || artworkUrl === frontArtwork) {
      return;
    }

    if (!frontArtwork) {
      setFrontArtwork(artworkUrl);
      setBackArtwork(artworkUrl);
      return;
    }

    setBackArtwork(artworkUrl);
    setIsFading(false);

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setIsFading(true));
    });
    const transitionTimer = window.setTimeout(() => {
      setFrontArtwork(artworkUrl);
      setBackArtwork(artworkUrl);
      setIsFading(false);
    }, BACKGROUND_TRANSITION_MS + 50);

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(transitionTimer);
    };
  }, [artworkUrl, frontArtwork]);

  return (
    <div className="song-background" aria-hidden="true">
      <div
        className="song-background-layer"
        style={{ backgroundImage: backArtwork ? `url(${backArtwork})` : "none" }}
      />
      <div
        className={`song-background-layer song-background-layer--front${isFading ? " song-background-layer--fading" : ""}`}
        style={{
          backgroundImage: frontArtwork ? `url(${frontArtwork})` : "none",
        }}
      />
    </div>
  );
}
