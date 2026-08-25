import { type ReactNode, useEffect, useState } from "react";

const RELEASE_DATE = new Date(2026, 8, 18, 0, 0, 0);

function getTimeRemaining(now: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((RELEASE_DATE.getTime() - now) / 1000),
  );
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;

  return [days, hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function ReleaseGate({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(Date.now());
  const skipCountdown = new URLSearchParams(window.location.search).has(
    "skipCountdown",
  );

  useEffect(() => {
    if (now >= RELEASE_DATE.getTime()) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [now]);

  if (skipCountdown || now >= RELEASE_DATE.getTime()) {
    return children;
  }

  return (
    <main className="release-page" aria-label="Album release countdown">
      <time dateTime={RELEASE_DATE.toISOString()}>
        {getTimeRemaining(now)}
      </time>
      <p>Days · Hours · Minutes · Seconds</p>
    </main>
  );
}
