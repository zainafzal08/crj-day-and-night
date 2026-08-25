import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jost";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DebugPage } from "./components/DebugPage";
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
