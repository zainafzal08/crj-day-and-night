import { getDatabase } from "@netlify/database";
import songData from "../../songs.json";

type Side = "Day" | "Night";

type SongMetadata = {
  side: Side;
  trackIndex: number;
  title: string;
  location: string;
};

type AggregatedRating = {
  album_id: Side;
  track_number: number;
  total_rating: number;
  vote_count: number;
};

const songs = songData.songs as SongMetadata[];
const sides: Side[] = ["Day", "Night"];

function ratingKey(albumId: Side, trackNumber: number) {
  return `${albumId}-${trackNumber}`;
}

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET" } },
    );
  }

  const database = getDatabase();
  const aggregatedRatings = await database.sql<AggregatedRating>`
    SELECT
      album_id,
      track_number,
      SUM(rating)::INTEGER AS total_rating,
      COUNT(*)::INTEGER AS vote_count
    FROM song_ratings
    WHERE album_id IN ('Day', 'Night')
      AND track_number BETWEEN 1 AND 12
    GROUP BY album_id, track_number
  `;

  const ratingsBySong = new Map(
    aggregatedRatings.map((rating) => [
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
        second.total_rating - first.total_rating ||
        (second.average_rating ?? 0) - (first.average_rating ?? 0) ||
        second.vote_count - first.vote_count ||
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

  return Response.json(
    {
      song_rankings: songRankings,
      album_averages: albumAverages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  path: "/api/results",
};
