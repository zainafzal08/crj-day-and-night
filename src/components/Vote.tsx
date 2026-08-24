import { useEffect, useRef, useState } from "react";
import { initializeSessionKey } from "../session";
import { useSong } from "../song-context";

const ratingOptions = [1, 2, 3, 4, 5] as const;
const VOTES_STORAGE_KEY = "votes";

type Rating = (typeof ratingOptions)[number];

const ratingDescriptions: Record<Rating, string> = {
  1: "Flop",
  2: "Passable",
  3: "Solid",
  4: "A Bop",
  5: "Iconic",
};

function isRating(value: unknown): value is Rating {
  return (
    typeof value === "number" && ratingOptions.includes(value as Rating)
  );
}

function loadRatings() {
  try {
    const storedRatings = window.localStorage.getItem(VOTES_STORAGE_KEY);

    if (!storedRatings) {
      return {};
    }

    const parsedRatings: unknown = JSON.parse(storedRatings);

    if (!parsedRatings || typeof parsedRatings !== "object") {
      return {};
    }

    const validRatings: Record<string, Rating> = {};

    Object.entries(parsedRatings).forEach(([songKey, rating]) => {
      if (/^(Day|Night)-(?:[1-9]|1[0-2])$/.test(songKey) && isRating(rating)) {
        validRatings[songKey] = rating;
      }
    });

    return validRatings;
  } catch {
    return {};
  }
}

export function Vote() {
  const { currentSong } = useSong();
  const songKey = currentSong
    ? `${currentSong.side}-${currentSong.trackIndex}`
    : "Day-1";
  const [ratings, setRatings] = useState<Record<string, Rating>>(loadRatings);
  const selectedRating = ratings[songKey] ?? null;
  const [displayedRating, setDisplayedRating] = useState<Rating | null>(null);
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const transitionTimer = useRef<number | null>(null);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(ratings));
    } catch {
      // The voting UI remains usable when storage is unavailable.
    }
  }, [ratings]);

  useEffect(() => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }

    if (animationFrame.current !== null) {
      window.cancelAnimationFrame(animationFrame.current);
    }

    const songRating = ratings[songKey] ?? null;
    setDisplayedRating(songRating);
    setDescriptionVisible(songRating !== null);
    setSubmissionError(null);
  }, [songKey]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
      }

      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  function showDescription() {
    animationFrame.current = window.requestAnimationFrame(() => {
      animationFrame.current = window.requestAnimationFrame(() => {
        setDescriptionVisible(true);
      });
    });
  }

  function displayRating(rating: Rating) {
    setRatings((currentRatings) => ({
      ...currentRatings,
      [songKey]: rating,
    }));

    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }

    if (animationFrame.current !== null) {
      window.cancelAnimationFrame(animationFrame.current);
    }

    if (displayedRating === rating && descriptionVisible) {
      return;
    }

    if (displayedRating === null) {
      setDisplayedRating(rating);
      setDescriptionVisible(false);
      showDescription();
      return;
    }

    setDescriptionVisible(false);
    transitionTimer.current = window.setTimeout(() => {
      setDisplayedRating(rating);
      showDescription();
    }, 200);
  }

  async function handleRating(rating: Rating) {
    if (selectedRating !== null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: initializeSessionKey(),
          rating,
          album_id: currentSong?.side ?? "Day",
          track_number: currentSong?.trackIndex ?? 1,
        }),
      });

      if (!response.ok) {
        throw new Error("Rating request failed");
      }

      const result = (await response.json()) as { rating?: unknown };

      if (!isRating(result.rating)) {
        throw new Error("Invalid rating response");
      }

      displayRating(result.rating);
    } catch {
      setSubmissionError("Save failed — try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`vote${selectedRating === 5 ? " vote--iconic" : ""}`}
      aria-label="Vote"
    >
      <div className="vote-control">
        {displayedRating && (
          <p
            className={`vote-description${
              descriptionVisible ? " vote-description--visible" : ""
            }`}
            aria-live="polite"
          >
            {ratingDescriptions[displayedRating]}
          </p>
        )}
        <div className="vote-bar">
          <div
            className="vote-fill"
            style={{ width: `${(selectedRating ?? 0) * 20}%` }}
          />
          <div className="vote-options" role="radiogroup" aria-label="Rating">
            {ratingOptions.map((rating) => (
              <button
                className="vote-option"
                type="button"
                role="radio"
                aria-checked={selectedRating === rating}
                aria-label={`${rating} out of 5`}
                disabled={selectedRating !== null || isSubmitting}
                key={rating}
                onClick={() => handleRating(rating)}
              >
                <span className="vote-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="vote-label" aria-live="polite">
        {isSubmitting
          ? "Saving..."
          : selectedRating
            ? `${selectedRating}/5`
            : submissionError ?? "No Rating"}
      </p>
    </div>
  );
}
