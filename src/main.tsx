import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jost";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Progress } from "./components/Progress";
import { ResultsPage } from "./components/ResultsPage";
import { SongBackground } from "./components/SongBackground";
import { SongCarousel } from "./components/SongCarousel";
import { Vote } from "./components/Vote";
import { initializeSessionKey } from "./session";
import { SongProvider } from "./song-context";
import "./styles.css";

initializeSessionKey();

function HomePage() {
  return (
    <SongProvider>
      <SongBackground />
      <main className="home-page">
        <SongCarousel />
        <Progress />
        <Vote />
      </main>
    </SongProvider>
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
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
