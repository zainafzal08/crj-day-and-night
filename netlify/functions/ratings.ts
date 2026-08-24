import { getDatabase } from "@netlify/database";

type RatingRequest = {
  session_id?: unknown;
  rating?: unknown;
  album_id?: unknown;
  track_number?: unknown;
};

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidRequest(body: RatingRequest) {
  return (
    typeof body.session_id === "string" &&
    sessionIdPattern.test(body.session_id) &&
    Number.isInteger(body.rating) &&
    Number(body.rating) >= 1 &&
    Number(body.rating) <= 5 &&
    typeof body.album_id === "string" &&
    body.album_id.trim().length >= 1 &&
    body.album_id.trim().length <= 100 &&
    Number.isInteger(body.track_number) &&
    Number(body.track_number) > 0
  );
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  let body: RatingRequest;

  try {
    body = (await request.json()) as RatingRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return Response.json(
      {
        error:
          "session_id, album_id, track_number, and a rating from 1 to 5 are required",
      },
      { status: 400 },
    );
  }

  const sessionId = body.session_id as string;
  const rating = body.rating as number;
  const albumId = (body.album_id as string).trim();
  const trackNumber = body.track_number as number;
  const database = getDatabase();

  const [storedRating] = await database.sql<{ rating: number }>`
    INSERT INTO song_ratings (session_id, rating, album_id, track_number)
    VALUES (${sessionId}, ${rating}, ${albumId}, ${trackNumber})
    ON CONFLICT (session_id, album_id, track_number)
    DO UPDATE SET rating = EXCLUDED.rating
    RETURNING rating
  `;

  if (!storedRating) {
    return Response.json({ error: "Could not store rating" }, { status: 500 });
  }

  return Response.json({ rating: storedRating.rating });
}

export const config = {
  path: "/api/ratings",
};
