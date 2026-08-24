import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

const CURRENT_SONG_STORAGE_KEY = "crj-current-song";

export type Song = {
  side: "Day" | "Night";
  trackIndex: number;
  title: string;
  location: string;
};

type SongContextValue = {
  currentSong: Song | null;
  setCurrentSong: Dispatch<SetStateAction<Song | null>>;
};

const SongContext = createContext<SongContextValue | null>(null);

function isSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") {
    return false;
  }

  const song = value as Record<string, unknown>;

  return (
    (song.side === "Day" || song.side === "Night") &&
    typeof song.trackIndex === "number" &&
    song.trackIndex >= 1 &&
    song.trackIndex <= 12 &&
    typeof song.title === "string" &&
    typeof song.location === "string"
  );
}

function loadCurrentSong() {
  try {
    const storedSong = window.localStorage.getItem(CURRENT_SONG_STORAGE_KEY);

    if (!storedSong) {
      return null;
    }

    const parsedSong: unknown = JSON.parse(storedSong);
    return isSong(parsedSong) ? parsedSong : null;
  } catch {
    return null;
  }
}

export function SongProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(loadCurrentSong);

  useEffect(() => {
    if (!currentSong) {
      return;
    }

    try {
      window.localStorage.setItem(
        CURRENT_SONG_STORAGE_KEY,
        JSON.stringify(currentSong),
      );
    } catch {
      // The app remains usable when storage is unavailable.
    }
  }, [currentSong]);

  useLayoutEffect(() => {
    document.documentElement.dataset.side =
      currentSong?.side.toLowerCase() ?? "day";
  }, [currentSong]);

  const value = useMemo(
    () => ({ currentSong, setCurrentSong }),
    [currentSong],
  );

  return <SongContext.Provider value={value}>{children}</SongContext.Provider>;
}

export function useSong() {
  const context = useContext(SongContext);

  if (!context) {
    throw new Error("useSong must be used within a SongProvider");
  }

  return context;
}
