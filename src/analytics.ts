const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag: (...args: unknown[]) => void;
  }
}

function hasValidMeasurementId(): boolean {
  return Boolean(measurementId && /^G-[A-Z0-9]+$/i.test(measurementId));
}

export function initializeAnalytics(): void {
  if (!import.meta.env.PROD || !hasValidMeasurementId()) {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer.push(args);
    };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  if (!document.querySelector(`script[data-google-analytics="${measurementId}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId!)}`;
    script.dataset.googleAnalytics = measurementId!;
    document.head.appendChild(script);
  }
}

export function trackPageView(pathname: string): void {
  if (!import.meta.env.PROD || !hasValidMeasurementId() || !window.gtag) {
    return;
  }

  // Deliberately omit query strings so OAuth codes and other URL parameters
  // never appear in Analytics.
  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
  });
}

