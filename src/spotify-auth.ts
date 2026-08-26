const tokenStorageKey = "crj-spotify-token-v1";
const pkceStoragePrefix = "crj-spotify-pkce-";

type SpotifyToken = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
};

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

let sessionPromise: Promise<SpotifyToken | null> | undefined;
let refreshPromise: Promise<SpotifyToken | null> | undefined;

export const spotifyScopes = [
  "playlist-read-private",
  "streaming",
  "user-modify-playback-state",
  "user-read-email",
  "user-read-playback-state",
  "user-read-private",
].join(" ");

export function spotifyRedirectUri() {
  return (
    import.meta.env.VITE_SPOTIFY_REDIRECT_URI ||
    `${window.location.origin}/game`
  );
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function storedToken(): SpotifyToken | null {
  try {
    const value = localStorage.getItem(tokenStorageKey);
    return value ? (JSON.parse(value) as SpotifyToken) : null;
  } catch {
    return null;
  }
}

function storeToken(response: SpotifyTokenResponse, previousRefreshToken?: string) {
  const token: SpotifyToken = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    refreshToken: response.refresh_token ?? previousRefreshToken ?? "",
  };
  localStorage.setItem(tokenStorageKey, JSON.stringify(token));
  return token;
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Spotify authentication failed");
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function startSpotifyLogin(clientId: string) {
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(20);
  localStorage.setItem(`${pkceStoragePrefix}${state}`, verifier);

  const authorizationUrl = new URL("https://accounts.spotify.com/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: spotifyRedirectUri(),
    response_type: "code",
    scope: spotifyScopes,
    state,
  }).toString();
  window.location.assign(authorizationUrl);
}

async function exchangeCallbackCode(clientId: string) {
  const parameters = new URLSearchParams(window.location.search);
  const error = parameters.get("error");
  const code = parameters.get("code");

  if (error) {
    throw new Error(`Spotify authorization was not completed (${error})`);
  }

  if (!code) {
    return null;
  }

  const returnedState = parameters.get("state");
  const verifier = returnedState
    ? localStorage.getItem(`${pkceStoragePrefix}${returnedState}`)
    : null;

  if (!returnedState || !verifier) {
    throw new Error("Spotify authorization state did not match");
  }

  const response = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: spotifyRedirectUri(),
    }),
  );
  localStorage.removeItem(`${pkceStoragePrefix}${returnedState}`);
  window.history.replaceState({}, "", "/game");
  return storeToken(response);
}

async function refreshSpotifyToken(clientId: string, token: SpotifyToken) {
  if (!token.refreshToken) {
    return null;
  }

  const response = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  );
  return storeToken(response, token.refreshToken);
}

export function establishSpotifySession(clientId: string) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const callbackToken = await exchangeCallbackCode(clientId);
      if (callbackToken) {
        return callbackToken;
      }
      return getValidSpotifyToken(clientId);
    })();
  }
  return sessionPromise;
}

export async function getValidSpotifyToken(clientId: string) {
  const token = storedToken();
  if (!token) {
    return null;
  }

  if (token.expiresAt > Date.now() + 60_000) {
    return token;
  }

  if (!refreshPromise) {
    refreshPromise = refreshSpotifyToken(clientId, token).finally(() => {
      refreshPromise = undefined;
    });
  }
  return refreshPromise;
}

export function clearSpotifySession() {
  localStorage.removeItem(tokenStorageKey);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(pkceStoragePrefix)) {
      localStorage.removeItem(key);
    }
  }
  sessionPromise = undefined;
}
