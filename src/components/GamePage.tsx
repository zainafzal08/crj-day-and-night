import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { gameSongs, type GameSong, spotifyPlaylistUrl } from "../game-songs";
import {
  clearSpotifySession,
  establishSpotifySession,
  getValidSpotifyToken,
  spotifyRedirectUri,
  startSpotifyLogin,
} from "../spotify-auth";
import {
  fetchPlaylistSongs,
  getSpotifyPlaybackSdk,
  playSpotifySong,
  type SpotifyPlayer,
} from "../spotify-player";

type AuthStatus =
  | "config-missing"
  | "connecting"
  | "ready"
  | "signed-out";
type Result = "correct" | "incorrect";
type SongScore = { correct: number; incorrect: number };
type Scores = Record<string, SongScore>;
type GuessTiming = { correctGuesses: number; totalSeconds: number };

const playlistId = "6N2p3X3BzAGlBn3SQCfAGB";
const heardStorageKey = "crj-song-game-heard-v1";
const scoreStorageKey = "crj-song-game-scores-v1";
const timingStorageKey = "crj-song-game-timing-v1";
const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? "";

function randomUnit() {
  const randomValue = new Uint32Array(1);
  crypto.getRandomValues(randomValue);
  return randomValue[0] / 2 ** 32;
}

function weightedRandomSong(
  pool: GameSong[],
  heardSongs: Set<string>,
  scores: Scores,
  excludeId?: string,
) {
  const candidates = pool.filter((candidate) => candidate.id !== excludeId);
  const available = candidates.length ? candidates : pool;
  const weightedCandidates = available.map((candidate) => {
    const score = scores[candidate.id];
    const weight = !heardSongs.has(candidate.id)
      ? 12
      : score?.incorrect
        ? 5 + Math.min(score.incorrect, 5)
        : 1;
    return { song: candidate, weight };
  });
  const totalWeight = weightedCandidates.reduce(
    (total, candidate) => total + candidate.weight,
    0,
  );
  let selection = randomUnit() * totalWeight;

  for (const candidate of weightedCandidates) {
    selection -= candidate.weight;
    if (selection < 0) {
      return candidate.song;
    }
  }

  return weightedCandidates.at(-1)?.song ?? gameSongs[0];
}

function normalizeTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\([^)]*feat\.[^)]*\)/giu, "")
    .replace(/\s*[-–—]\s*bonus track\s*$/giu, "")
    .replace(/[’‘]/gu, "'")
    .replace(/&/gu, "and")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

function loadScores(): Scores {
  try {
    const stored = localStorage.getItem(scoreStorageKey);
    return stored ? (JSON.parse(stored) as Scores) : {};
  } catch {
    return {};
  }
}

function loadHeardSongs() {
  try {
    const stored = localStorage.getItem(heardStorageKey);
    return new Set<string>(stored ? (JSON.parse(stored) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function loadGuessTiming(): GuessTiming {
  try {
    const stored = localStorage.getItem(timingStorageKey);
    return stored
      ? (JSON.parse(stored) as GuessTiming)
      : { correctGuesses: 0, totalSeconds: 0 };
  } catch {
    return { correctGuesses: 0, totalSeconds: 0 };
  }
}

function formatGuessTime(seconds: number) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainingSeconds}`;
}

function formatPlaybackTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function GamePage() {
  const [songs, setSongs] = useState<GameSong[]>(gameSongs);
  const [song, setSong] = useState(() =>
    weightedRandomSong(gameSongs, loadHeardSongs(), loadScores()),
  );
  const [guess, setGuess] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>(
    spotifyClientId ? "connecting" : "config-missing",
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [guessTime, setGuessTime] = useState<number | null>(null);
  const [scores, setScores] = useState<Scores>(loadScores);
  const [heardSongs, setHeardSongs] = useState<Set<string>>(loadHeardSongs);
  const [guessTiming, setGuessTiming] = useState<GuessTiming>(loadGuessTiming);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playlistNotice, setPlaylistNotice] = useState<string | null>(null);
  const player = useRef<SpotifyPlayer | null>(null);
  const playbackBasePosition = useRef(0);
  const playbackUpdatedAt = useRef<number | null>(null);
  const roundStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!spotifyClientId) {
      return;
    }

    let cancelled = false;

    void establishSpotifySession(spotifyClientId)
      .then(async (token) => {
        if (cancelled) {
          return;
        }
        if (!token) {
          setAuthStatus("signed-out");
          return;
        }

        try {
          const liveSongs = await fetchPlaylistSongs(token.accessToken, playlistId);
          const allowedSongIds = new Set(gameSongs.map(({ id }) => id));
          const verifiedSongs = liveSongs.filter(({ id }) => allowedSongIds.has(id));
          if (!verifiedSongs.length) {
            throw new Error("The Spotify playlist contains no playable tracks");
          }
          if (!cancelled) {
            setSongs(verifiedSongs);
            setSong(weightedRandomSong(verifiedSongs, heardSongs, scores));
          }
        } catch (error) {
          if (!cancelled) {
            setPlaylistNotice(
              `${
                error instanceof Error
                  ? error.message
                  : "The live Spotify playlist could not be loaded"
              }. Using the verified ${gameSongs.length}-song playlist.`,
            );
            setSongs(gameSongs);
            setSong(weightedRandomSong(gameSongs, heardSongs, scores));
          }
        }

        const spotify = await getSpotifyPlaybackSdk();
        if (cancelled) {
          return;
        }

        const browserPlayer = new spotify.Player({
          name: "CRJ Name That Song",
          volume: 0.8,
          getOAuthToken: (callback) => {
            void getValidSpotifyToken(spotifyClientId).then((freshToken) => {
              if (freshToken) {
                callback(freshToken.accessToken);
              }
            });
          },
        });
        player.current = browserPlayer;
        browserPlayer.addListener("ready", ({ device_id }) => {
          if (device_id && !cancelled) {
            setDeviceId(device_id);
            setAuthStatus("ready");
          }
        });
        browserPlayer.addListener("not_ready", () => {
          if (!cancelled) {
            setDeviceId(null);
            setAuthStatus("connecting");
          }
        });
        browserPlayer.addListener("player_state_changed", (state) => {
          if (state && !cancelled) {
            setPlaybackPosition(state.position);
            setPlaybackDuration(state.duration);
            playbackBasePosition.current = state.position;
            playbackUpdatedAt.current = state.paused ? null : performance.now();
          }
        });
        for (const event of [
          "initialization_error",
          "authentication_error",
          "account_error",
          "playback_error",
        ]) {
          browserPlayer.addListener(event, ({ message }) => {
            if (!cancelled) {
              setPlayerError(message ?? "Spotify playback failed");
            }
          });
        }

        const connected = await browserPlayer.connect();
        if (!connected && !cancelled) {
          setPlayerError("Spotify could not connect a browser player");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuthStatus("signed-out");
          setPlayerError(
            error instanceof Error ? error.message : "Spotify authentication failed",
          );
        }
      });

    return () => {
      cancelled = true;
      player.current?.disconnect();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasPlayed || result) {
      return;
    }

    const interval = window.setInterval(() => {
      if (playbackUpdatedAt.current === null) {
        return;
      }

      const elapsed = performance.now() - playbackUpdatedAt.current;
      const estimatedPosition = playbackBasePosition.current + elapsed;
      setPlaybackPosition(
        playbackDuration > 0
          ? Math.min(estimatedPosition, playbackDuration)
          : estimatedPosition,
      );
    }, 250);

    return () => window.clearInterval(interval);
  }, [hasPlayed, playbackDuration, result]);

  const totals = useMemo(
    () =>
      Object.values(scores).reduce(
        (total, score) => ({
          correct: total.correct + score.correct,
          incorrect: total.incorrect + score.incorrect,
        }),
        { correct: 0, incorrect: 0 },
      ),
    [scores],
  );

  const attemptedSongs = useMemo(
    () => songs.filter(({ id }) => scores[id]?.correct || scores[id]?.incorrect),
    [scores, songs],
  );

  const heardCount = useMemo(
    () => songs.reduce((total, currentSong) => total + Number(heardSongs.has(currentSong.id)), 0),
    [heardSongs, songs],
  );

  const averageGuessTime =
    guessTiming.correctGuesses > 0
      ? guessTiming.totalSeconds / guessTiming.correctGuesses
      : null;

  function recordCorrectGuessTime(seconds: number) {
    setGuessTiming((current) => {
      const next = {
        correctGuesses: current.correctGuesses + 1,
        totalSeconds: current.totalSeconds + seconds,
      };
      localStorage.setItem(timingStorageKey, JSON.stringify(next));
      return next;
    });
  }

  async function startSong(targetSong: GameSong) {
    if (!deviceId || !player.current || !spotifyClientId) {
      return;
    }

    setPlayerError(null);
    try {
      await player.current.activateElement();
      const token = await getValidSpotifyToken(spotifyClientId);
      if (!token) {
        setAuthStatus("signed-out");
        return;
      }
      await playSpotifySong(token.accessToken, deviceId, targetSong);
      setPlaybackPosition(0);
      playbackBasePosition.current = 0;
      playbackUpdatedAt.current = performance.now();
      setHeardSongs((current) => {
        if (current.has(targetSong.id)) {
          return current;
        }
        const next = new Set(current).add(targetSong.id);
        localStorage.setItem(heardStorageKey, JSON.stringify([...next]));
        return next;
      });
      if (roundStartedAt.current === null) {
        roundStartedAt.current = performance.now();
      }
      setHasPlayed(true);
    } catch (error) {
      setPlayerError(
        error instanceof Error ? error.message : "Spotify playback failed",
      );
    }
  }

  function playFromStart() {
    return startSong(song);
  }

  function submitGuess(event: FormEvent) {
    event.preventDefault();

    if (!hasPlayed || result || !guess.trim()) {
      return;
    }

    void player.current?.pause();
    playbackUpdatedAt.current = null;
    const nextResult: Result =
      normalizeTitle(guess) === normalizeTitle(song.title) ? "correct" : "incorrect";
    const elapsedSeconds =
      roundStartedAt.current === null
        ? null
        : (performance.now() - roundStartedAt.current) / 1000;
    setGuessTime(elapsedSeconds);
    if (nextResult === "correct" && elapsedSeconds !== null) {
      recordCorrectGuessTime(elapsedSeconds);
    }
    const currentScore = scores[song.id] ?? { correct: 0, incorrect: 0 };
    const nextScores = {
      ...scores,
      [song.id]: {
        ...currentScore,
        [nextResult]: currentScore[nextResult] + 1,
      },
    };

    setResult(nextResult);
    setScores(nextScores);
    localStorage.setItem(scoreStorageKey, JSON.stringify(nextScores));
  }

  async function nextSong() {
    const next = weightedRandomSong(songs, heardSongs, scores, song.id);
    setSong(next);
    setGuess("");
    setHasPlayed(false);
    setResult(null);
    setGuessTime(null);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    playbackBasePosition.current = 0;
    playbackUpdatedAt.current = null;
    roundStartedAt.current = null;
    await startSong(next);
  }

  function markIncorrectAsCorrect() {
    if (result !== "incorrect") {
      return;
    }

    const currentScore = scores[song.id] ?? { correct: 0, incorrect: 0 };
    const nextScores = {
      ...scores,
      [song.id]: {
        correct: currentScore.correct + 1,
        incorrect: Math.max(0, currentScore.incorrect - 1),
      },
    };
    setScores(nextScores);
    setResult("correct");
    if (guessTime !== null) {
      recordCorrectGuessTime(guessTime);
    }
    localStorage.setItem(scoreStorageKey, JSON.stringify(nextScores));
  }

  function resetScores() {
    localStorage.removeItem(heardStorageKey);
    localStorage.removeItem(scoreStorageKey);
    localStorage.removeItem(timingStorageKey);
    setHeardSongs(new Set());
    setScores({});
    setGuessTiming({ correctGuesses: 0, totalSeconds: 0 });
  }

  function disconnectSpotify() {
    player.current?.disconnect();
    clearSpotifySession();
    setDeviceId(null);
    setHasPlayed(false);
    setResult(null);
    setAuthStatus("signed-out");
  }

  return (
    <main className="game-page">
      <section className="game-card">
        <header className="game-header">
          <div>
            <p className="game-eyebrow">Carly Rae Jepsen</p>
            <h1>Name that song</h1>
          </div>
          <div className="game-score" aria-label="Overall score">
            <span><strong>{totals.correct}</strong> correct</span>
            <span><strong>{totals.incorrect}</strong> incorrect</span>
            <span><strong>{heardCount}/{songs.length}</strong> heard</span>
            <span>
              <strong>{averageGuessTime === null ? "—" : `${averageGuessTime.toFixed(1)}s`}</strong>
              avg guess
            </span>
          </div>
        </header>

        {authStatus === "config-missing" ? (
          <section className="game-auth game-auth--setup">
            <h2>Connect a Spotify developer app</h2>
            <p>
              Add <code>VITE_SPOTIFY_CLIENT_ID</code> to <code>.env</code>, then
              register this exact redirect URI in Spotify:
            </p>
            <code>{spotifyRedirectUri()}</code>
          </section>
        ) : authStatus === "signed-out" ? (
          <section className="game-auth">
            <h2>Full songs from 0:00</h2>
            <p>Connect your Spotify Premium account to start the game.</p>
            <button type="button" onClick={() => void startSpotifyLogin(spotifyClientId)}>
              Connect Spotify
            </button>
          </section>
        ) : (
          <>
            <div className="game-player">
              <div className="game-player-cover">
                <strong className="game-player-time">
                  {formatPlaybackTime(playbackPosition)}
                  {playbackDuration > 0 && ` / ${formatPlaybackTime(playbackDuration)}`}
                </strong>
                <p>
                  {result
                    ? "Playback paused. Answer revealed below."
                    : hasPlayed
                      ? "Submit your guess when you're ready."
                      : "Press Play to start the song."}
                </p>
              </div>
            </div>

            <button
              className="game-play-button"
              type="button"
              onClick={() => void playFromStart()}
              disabled={authStatus !== "ready" || Boolean(result)}
            >
              {authStatus !== "ready"
                ? "Connecting Spotify…"
                : hasPlayed
                  ? "Restart song"
                  : "Play song"}
            </button>

            <form className="game-guess" onSubmit={submitGuess}>
              <label htmlFor="song-guess">What song is it?</label>
              <div>
                <input
                  id="song-guess"
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  placeholder={hasPlayed ? "Type the song title" : "Play the song first"}
                  autoComplete="off"
                  disabled={!hasPlayed || Boolean(result)}
                />
                <button disabled={!hasPlayed || Boolean(result) || !guess.trim()}>
                  Guess
                </button>
              </div>
            </form>

            {result && (
              <section className={`game-answer game-answer--${result}`} aria-live="polite">
                <p>{result === "correct" ? "Correct!" : "Not quite — it was"}</p>
                <h2>{song.title}</h2>
                {result === "correct" && guessTime !== null && (
                  <p className="game-answer-time">
                    You got it in {formatGuessTime(guessTime)}.
                  </p>
                )}
                <a
                  href={`https://open.spotify.com/track/${song.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open track in Spotify
                </a>
                <div className="game-answer-actions">
                  {result === "incorrect" && (
                    <button type="button" onClick={markIncorrectAsCorrect}>
                      Mark as correct
                    </button>
                  )}
                  <button type="button" onClick={() => void nextSong()}>Next song</button>
                </div>
              </section>
            )}
          </>
        )}

        {playerError && <p className="game-error" role="alert">{playerError}</p>}
        {playlistNotice && <p className="game-notice">{playlistNotice}</p>}

        <footer className="game-footer">
          <a href={spotifyPlaylistUrl} target="_blank" rel="noreferrer">
            {songs.length} songs from the Spotify playlist
          </a>
          {authStatus === "ready" && (
            <button className="game-disconnect" type="button" onClick={disconnectSpotify}>
              Disconnect Spotify
            </button>
          )}
          <details>
            <summary>Per-song scores ({attemptedSongs.length} attempted)</summary>
            {attemptedSongs.length ? (
              <div className="game-song-scores">
                {attemptedSongs.map((attemptedSong) => (
                  <div key={attemptedSong.id}>
                    <span>{attemptedSong.title}</span>
                    <span>{scores[attemptedSong.id]?.correct ?? 0} ✓</span>
                    <span>{scores[attemptedSong.id]?.incorrect ?? 0} ✕</span>
                  </div>
                ))}
                <button type="button" onClick={resetScores}>Reset scores and heard progress</button>
              </div>
            ) : (
              <p>No guesses yet.</p>
            )}
          </details>
        </footer>
      </section>
    </main>
  );
}
