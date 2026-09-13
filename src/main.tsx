import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jost";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { initializeAnalytics, trackPageView } from "./analytics";
import { DebugPage } from "./components/DebugPage";
import { GamePage } from "./components/GamePage";
import { LoadingScreen } from "./components/LoadingScreen";
import { Progress } from "./components/Progress";
import { ResultsPage } from "./components/ResultsPage";
import { ReleaseGate } from "./components/ReleaseGate";
import { SongBackground } from "./components/SongBackground";
import { SongCarousel } from "./components/SongCarousel";
import { Vote } from "./components/Vote";
import { initializeSessionKey } from "./session";
import { SongProvider } from "./song-context";
import "./styles.css";

initializeSessionKey();
initializeAnalytics();

function AnalyticsPageTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}

function HomePage() {
  const [artworkReady, setArtworkReady] = useState(false);
  const handleArtworkReady = useCallback(() => setArtworkReady(true), []);

  return (
    <ReleaseGate>
      <SongProvider>
        <SongBackground onReady={handleArtworkReady} />
        <main className="home-page">
          <SongCarousel />
          <Progress />
          <Vote />
        </main>
        <LoadingScreen visible={!artworkReady} />
      </SongProvider>
    </ReleaseGate>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsPageTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
