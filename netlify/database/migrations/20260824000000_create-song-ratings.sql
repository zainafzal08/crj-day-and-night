CREATE TABLE song_ratings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  album_id TEXT NOT NULL CHECK (length(album_id) BETWEEN 1 AND 100),
  track_number INTEGER NOT NULL CHECK (track_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, album_id, track_number)
);

CREATE INDEX song_ratings_song_idx
  ON song_ratings (album_id, track_number);
