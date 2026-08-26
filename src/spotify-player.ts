import type { GameSong } from "./game-songs";

export type SpotifyPlayer = {
  activateElement: () => Promise<void>;
  addListener: (
    event: string,
    listener: (value: { device_id?: string; message?: string }) => void,
  ) => boolean;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
};

type SpotifySdk = {
  Player: new (options: {
    getOAuthToken: (callback: (token: string) => void) => void;
    name: string;
    volume: number;
  }) => SpotifyPlayer;
};

declare global {
  interface Window {
    Spotify?: SpotifySdk;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkPromise: Promise<SpotifySdk> | undefined;

export function getSpotifyPlaybackSdk() {
  if (window.Spotify) {
    return Promise.resolve(window.Spotify);
  }

  if (!sdkPromise) {
    sdkPromise = new Promise<SpotifySdk>((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (window.Spotify) {
          resolve(window.Spotify);
        }
      };

      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.addEventListener(
        "error",
        () => reject(new Error("Spotify's player failed to load")),
        { once: true },
      );
      document.head.append(script);
    });
  }

  return sdkPromise;
}

export async function fetchPlaylistSongs(accessToken: string, playlistId: string) {
  const songs: GameSong[] = [];

  for (let offset = 0; ; offset += 50) {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? "Spotify only exposes this playlist to its owner or collaborators"
          : "The Spotify playlist could not be loaded",
      );
    }

    const data = (await response.json()) as {
      items?: Array<{
        item?: { id?: string; name?: string; type?: string };
        track?: { id?: string; name?: string; type?: string };
      }>;
    };
    const items = data.items ?? [];

    for (const entry of items) {
      const track = entry.track ?? entry.item;
      if (track?.type === "track" && track.id && track.name) {
        songs.push({ id: track.id, title: track.name });
      }
    }

    if (items.length < 50) {
      break;
    }
  }

  return songs;
}

export async function playSpotifySong(
  accessToken: string,
  deviceId: string,
  song: GameSong,
) {
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        position_ms: 0,
        uris: [`spotify:track:${song.id}`],
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Spotify could not start playback in this browser");
  }
}
