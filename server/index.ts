import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

type Side = "Day" | "Night";

type SongMetadata = {
  side: Side;
  trackIndex: number;
  title: string;
  location: string;
};

type RatingRequest = {
  session_id?: unknown;
  rating?: unknown;
  album_id?: unknown;
  track_number?: unknown;
};

type AggregatedRating = {
  album_id: Side;
  track_number: number;
  total_rating: number;
  vote_count: number;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });
const songData = JSON.parse(
  await readFile(resolve(process.cwd(), "songs.json"), "utf8"),
) as { songs: SongMetadata[] };
const songs = songData.songs as SongMetadata[];
const sides: Side[] = ["Day", "Night"];
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const serverDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = resolve(serverDirectory, "../dist");
const maximumBodyBytes = 16 * 1024;
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendJson(
  response: ServerResponse,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maximumBodyBytes) {
      throw new HttpError("Request body is too large", 413);
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError("Invalid JSON body", 400);
  }
}

function isValidRatingRequest(body: unknown): body is Required<RatingRequest> {
  if (!body || typeof body !== "object") {
    return false;
  }

  const rating = body as RatingRequest;

  return (
    typeof rating.session_id === "string" &&
    sessionIdPattern.test(rating.session_id) &&
    Number.isInteger(rating.rating) &&
    Number(rating.rating) >= 1 &&
    Number(rating.rating) <= 5 &&
    (rating.album_id === "Day" || rating.album_id === "Night") &&
    Number.isInteger(rating.track_number) &&
    Number(rating.track_number) >= 1 &&
    Number(rating.track_number) <= 12
  );
}

async function storeRating(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody(request);

  if (!isValidRatingRequest(body)) {
    throw new HttpError(
      "session_id, a Day or Night album_id, a track_number from 1 to 12, and a rating from 1 to 5 are required",
      400,
    );
  }

  const result = await pool.query<{ rating: number }>(
    `
      INSERT INTO song_ratings (session_id, rating, album_id, track_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (session_id, album_id, track_number)
      DO UPDATE SET rating = EXCLUDED.rating
      RETURNING rating
    `,
    [body.session_id, body.rating, body.album_id, body.track_number],
  );
  const storedRating = result.rows[0];

  if (!storedRating) {
    throw new HttpError("Could not store rating", 500);
  }

  sendJson(response, { rating: storedRating.rating });
}

function ratingKey(albumId: Side, trackNumber: number) {
  return `${albumId}-${trackNumber}`;
}

async function getResults(response: ServerResponse) {
  const result = await pool.query<AggregatedRating>(`
    SELECT
      album_id,
      track_number,
      SUM(rating)::INTEGER AS total_rating,
      COUNT(*)::INTEGER AS vote_count
    FROM song_ratings
    WHERE album_id IN ('Day', 'Night')
      AND track_number BETWEEN 1 AND 12
    GROUP BY album_id, track_number
  `);
  const ratingsBySong = new Map(
    result.rows.map((rating) => [
      ratingKey(rating.album_id, rating.track_number),
      {
        totalRating: Number(rating.total_rating),
        voteCount: Number(rating.vote_count),
      },
    ]),
  );
  const songRankings = songs
    .map((song) => {
      const rating = ratingsBySong.get(
        ratingKey(song.side, song.trackIndex),
      );
      const totalRating = rating?.totalRating ?? 0;
      const voteCount = rating?.voteCount ?? 0;

      return {
        album_id: song.side,
        track_number: song.trackIndex,
        title: song.title,
        location: song.location,
        total_rating: totalRating,
        vote_count: voteCount,
        average_rating: voteCount > 0 ? totalRating / voteCount : null,
      };
    })
    .sort(
      (first, second) =>
        (second.average_rating ?? -1) - (first.average_rating ?? -1) ||
        second.vote_count - first.vote_count ||
        second.total_rating - first.total_rating ||
        sides.indexOf(first.album_id) - sides.indexOf(second.album_id) ||
        first.track_number - second.track_number,
    )
    .map((song, index) => ({ rank: index + 1, ...song }));
  const albumAverages = sides.map((albumId) => {
    const albumSongs = songRankings.filter(
      (song) => song.album_id === albumId,
    );
    const totalRating = albumSongs.reduce(
      (total, song) => total + song.total_rating,
      0,
    );
    const voteCount = albumSongs.reduce(
      (total, song) => total + song.vote_count,
      0,
    );

    return {
      album_id: albumId,
      average_rating: voteCount > 0 ? totalRating / voteCount : null,
      vote_count: voteCount,
    };
  });

  sendJson(
    response,
    { song_rankings: songRankings, album_averages: albumAverages },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function serveClient(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const requestedPath = resolve(clientDirectory, relativePath);
  const isInsideClientDirectory =
    requestedPath === clientDirectory ||
    requestedPath.startsWith(`${clientDirectory}${sep}`);

  if (!isInsideClientDirectory) {
    throw new HttpError("Not found", 404);
  }

  let filePath = requestedPath;

  try {
    if (!(await stat(filePath)).isFile()) {
      throw new Error("Not a file");
    }
  } catch {
    if (pathname.startsWith("/assets/") || extname(relativePath)) {
      throw new HttpError("Not found", 404);
    }

    filePath = resolve(clientDirectory, "index.html");
  }

  const file = await readFile(filePath);
  const isAsset = filePath.includes(`${sep}assets${sep}`);
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": isAsset
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  response.end(file);
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS song_ratings (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id UUID NOT NULL,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      album_id TEXT NOT NULL CHECK (length(album_id) BETWEEN 1 AND 100),
      track_number INTEGER NOT NULL CHECK (track_number > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, album_id, track_number)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS song_ratings_song_idx
      ON song_ratings (album_id, track_number)
  `);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/api/ratings") {
      if (request.method !== "POST") {
        sendJson(response, { error: "Method not allowed" }, 405, {
          Allow: "POST",
        });
        return;
      }

      await storeRating(request, response);
      return;
    }

    if (url.pathname === "/api/results") {
      if (request.method !== "GET") {
        sendJson(response, { error: "Method not allowed" }, 405, {
          Allow: "GET",
        });
        return;
      }

      await getResults(response);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      throw new HttpError("Not found", 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      throw new HttpError("Method not allowed", 405);
    }

    await serveClient(request, response, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError ? error.message : "Internal server error";

    if (!(error instanceof HttpError) || status >= 500) {
      console.error(error);
    }

    if (!response.headersSent) {
      sendJson(response, { error: message }, status);
    } else {
      response.end();
    }
  }
});

await initializeDatabase();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
server.listen(port, host, () => {
  console.log(`CRJ server listening on ${host}:${port}`);
});

async function shutDown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", () => void shutDown());
process.on("SIGTERM", () => void shutDown());
