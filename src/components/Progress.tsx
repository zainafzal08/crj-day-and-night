import { useSong } from "../song-context";

export function Progress() {
  const { currentSong } = useSong();
  const side = currentSong?.side ?? "Day";
  const trackIndex = currentSong?.trackIndex ?? 1;
  const percentage = Math.min((trackIndex / 12) * 100, 100);
  const isLastCardOfSide = trackIndex === 12;
  const label = `${side} Side, Track ${trackIndex}`;

  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${side} side progress`}
        aria-valuemin={1}
        aria-valuemax={12}
        aria-valuenow={trackIndex}
      >
        <div
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        >
          {!isLastCardOfSide && (
            <span className="progress-tail" aria-hidden="true" />
          )}
          <span className="progress-dot" aria-hidden="true" />
        </div>
      </div>
      <p className="progress-label" aria-live="polite">{label}</p>
    </div>
  );
}
