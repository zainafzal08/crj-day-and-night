import { useSong } from "../song-context";

export function Progress() {
  const { currentSong } = useSong();
  const side = currentSong?.side ?? "Day";
  const trackIndex = currentSong?.trackIndex ?? 1;
  const albumTrackIndex = side === "Night" ? trackIndex + 12 : trackIndex;
  const percentage = Math.min((albumTrackIndex / 24) * 100, 100);
  const isLastCard = albumTrackIndex === 24;
  const label = `${side} Side, Track ${albumTrackIndex}`;

  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Album progress"
        aria-valuemin={1}
        aria-valuemax={24}
        aria-valuenow={albumTrackIndex}
      >
        <div
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        >
          {!isLastCard && (
            <span className="progress-tail" aria-hidden="true" />
          )}
          <span className="progress-dot" aria-hidden="true" />
        </div>
      </div>
      <p className="progress-label" aria-live="polite">{label}</p>
    </div>
  );
}
