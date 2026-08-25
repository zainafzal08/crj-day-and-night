import { useEffect, useRef, useState } from "react";
import { recordDebugError } from "../debug-errors";
import { initializeSessionKey } from "../session";
import { useSong } from "../song-context";

const ratingOptions = [1, 2, 3, 4, 5] as const;
const VOTES_STORAGE_KEY = "votes";

type Rating = (typeof ratingOptions)[number];

type RatingPayload = {
  session_id: string;
  rating: Rating;
  album_id: "Day" | "Night";
  track_number: number;
};

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
  const [pendingRequests, setPendingRequests] = useState(0);
  const transitionTimer = useRef<number | null>(null);
  const animationFrame = useRef<number | null>(null);
  const submissionQueue = useRef<Promise<void>>(Promise.resolve());

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

  useEffect(() => {
    if (pendingRequests === 0) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [pendingRequests]);

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

  async function submitRating(payload: RatingPayload) {
    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `Rating request failed (${response.status})${responseBody ? `: ${responseBody}` : ""}`,
        );
      }

      const result = (await response.json()) as { rating?: unknown };

      if (!isRating(result.rating) || result.rating !== payload.rating) {
        throw new Error("Invalid rating response");
      }
    } catch (error) {
      recordDebugError("rating-submission", error, {
        album_id: payload.album_id,
        track_number: payload.track_number,
        rating: payload.rating,
      });
    } finally {
      setPendingRequests((current) => Math.max(0, current - 1));
    }
  }

  function handleRating(rating: Rating) {
    if (selectedRating === rating) {
      return;
    }

    const payload: RatingPayload = {
      session_id: initializeSessionKey(),
      rating,
      album_id: currentSong?.side ?? "Day",
      track_number: currentSong?.trackIndex ?? 1,
    };

    displayRating(rating);
    setPendingRequests((current) => current + 1);
    submissionQueue.current = submissionQueue.current.then(() =>
      submitRating(payload),
    );
  }

  return (
    <div
      className={`vote${selectedRating === 5 ? " vote--iconic" : ""}`}
      aria-label="Vote"
    >
      <div className="vote-control">
        <div className="vote-bar-group">
          {displayedRating && (
            <div className="vote-description-viewport">
              <p
                className={`vote-description${
                  descriptionVisible ? " vote-description--visible" : ""
                }`}
                aria-live="polite"
              >
                {ratingDescriptions[displayedRating]}
              </p>
            </div>
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
                  key={rating}
                  onClick={() => handleRating(rating)}
                >
                  <span className="vote-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="vote-label" aria-live="polite">
        {selectedRating ? `${selectedRating}/5` : "No Rating"}
      </p>
    </div>
  );
}
