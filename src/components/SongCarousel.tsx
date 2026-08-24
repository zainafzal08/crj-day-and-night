import { type UIEvent, useEffect, useRef } from "react";
import songData from "../../songs.json";
import { type Song, useSong } from "../song-context";
import { SongCard } from "./SongCard";

const songs = songData.songs as Song[];

export function SongCarousel() {
  const { currentSong, setCurrentSong } = useSong();
  const carouselRef = useRef<HTMLDivElement>(null);
  const initialSong = useRef(currentSong);
  const activeIndex = useRef(-1);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    const storedSong = initialSong.current;
    const initialIndex = storedSong
      ? songs.findIndex(
          (song) =>
            song.side === storedSong.side &&
            song.trackIndex === storedSong.trackIndex,
        )
      : 0;
    const safeInitialIndex = initialIndex >= 0 ? initialIndex : 0;

    activeIndex.current = safeInitialIndex;
    setCurrentSong(songs[safeInitialIndex] ?? null);

    animationFrame.current = requestAnimationFrame(() => {
      const carousel = carouselRef.current;
      const cards = carousel
        ? (Array.from(carousel.children) as HTMLElement[])
        : [];
      const firstCardOffset = cards[0]?.offsetLeft ?? 0;

      if (carousel && cards[safeInitialIndex]) {
        carousel.scrollLeft =
          cards[safeInitialIndex].offsetLeft - firstCardOffset;
      }
    });

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [setCurrentSong]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const carousel = event.currentTarget;

    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
    }

    animationFrame.current = requestAnimationFrame(() => {
      const cards = Array.from(carousel.children) as HTMLElement[];
      const firstCardOffset = cards[0]?.offsetLeft ?? 0;
      let nextIndex = 0;
      let shortestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardOffset = card.offsetLeft - firstCardOffset;
        const distance = Math.abs(cardOffset - carousel.scrollLeft);

        if (distance < shortestDistance) {
          nextIndex = index;
          shortestDistance = distance;
        }
      });

      if (nextIndex !== activeIndex.current) {
        activeIndex.current = nextIndex;
        setCurrentSong(songs[nextIndex] ?? null);
      }
    });
  }

  return (
    <div
      ref={carouselRef}
      className="song-carousel"
      role="region"
      aria-label="Songs"
      tabIndex={0}
      onScroll={handleScroll}
    >
      {songs.map((song) => (
        <SongCard
          key={`${song.side}-${song.trackIndex}`}
          song={song}
        />
      ))}
    </div>
  );
}
