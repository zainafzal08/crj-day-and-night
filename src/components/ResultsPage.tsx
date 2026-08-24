import { useEffect, useState } from "react";
import type { Song } from "../song-context";
import { SongCard } from "./SongCard";

type Side = Song["side"];

type RankedSong = {
  rank: number;
  album_id: Side;
  track_number: number;
  title: string;
  location: string;
  total_rating: number;
  vote_count: number;
  average_rating: number | null;
};

type AlbumAverage = {
  album_id: Side;
  average_rating: number | null;
  vote_count: number;
};

type ResultsResponse = {
  song_rankings: RankedSong[];
  album_averages: AlbumAverage[];
};

function formatRating(rating: number | null) {
  return rating === null ? "—" : rating.toFixed(2);
}

export function ResultsPage() {
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadResults() {
      try {
        const response = await fetch("/api/results", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Results request failed");
        }

        const nextResults = (await response.json()) as ResultsResponse;

        if (
          !Array.isArray(nextResults.song_rankings) ||
          !Array.isArray(nextResults.album_averages)
        ) {
          throw new Error("Invalid results response");
        }

        setResults(nextResults);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setError("Couldn’t load results");
      }
    }

    void loadResults();

    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <main className="results-page results-page--status" aria-label="Results">
        <p>{error}</p>
      </main>
    );
  }

  if (!results) {
    return (
      <main className="results-page results-page--status" aria-label="Results">
        <p>Loading results…</p>
      </main>
    );
  }

  const bestSong = results.song_rankings[0];
  const dayAverage =
    results.album_averages.find((average) => average.album_id === "Day")
      ?.average_rating ?? null;
  const nightAverage =
    results.album_averages.find((average) => average.album_id === "Night")
      ?.average_rating ?? null;

  return (
    <main className="results-page" aria-label="Results">
      <section className="results-feature" aria-label="Highest rated song">
        {bestSong && (
          <SongCard
            className="song-card--result"
            song={{
              side: bestSong.album_id,
              trackIndex: bestSong.track_number,
              title: bestSong.title,
              location: bestSong.location,
            }}
          />
        )}
        <h1>Best Song</h1>
        <dl className="results-averages">
          <div>
            <dd>{formatRating(dayAverage)}</dd>
            <dt>Day</dt>
          </div>
          <div>
            <dd>{formatRating(nightAverage)}</dd>
            <dt>Night</dt>
          </div>
        </dl>
      </section>

      <section className="results-ranking" aria-label="Song rankings">
        <ol className="results-ranking-list">
          {results.song_rankings.map((song) => (
            <li key={`${song.album_id}-${song.track_number}`}>
              <span className="results-rank">
                {String(song.rank).padStart(2, "0")}
              </span>
              <span className="results-song-name">
                <span className="results-song-title">{song.title}</span>
                <span className="results-song-rating">
                  ({formatRating(song.average_rating)})
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
