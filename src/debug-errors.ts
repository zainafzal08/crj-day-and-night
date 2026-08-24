export type DebugErrorEntry = {
  timestamp: string;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
};

const DEBUG_ERRORS_STORAGE_KEY = "crj-debug-errors";
const MAX_DEBUG_ERRORS = 100;

function loadDebugErrors() {
  try {
    const storedErrors = window.sessionStorage.getItem(DEBUG_ERRORS_STORAGE_KEY);

    if (!storedErrors) {
      return [];
    }

    const parsedErrors: unknown = JSON.parse(storedErrors);
    return Array.isArray(parsedErrors)
      ? (parsedErrors as DebugErrorEntry[]).slice(-MAX_DEBUG_ERRORS)
      : [];
  } catch {
    return [];
  }
}

let entries: DebugErrorEntry[] = loadDebugErrors();
const listeners = new Set<() => void>();

export function recordDebugError(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  entries = [
    ...entries,
    {
      timestamp: new Date().toISOString(),
      source,
      message: normalizedError.message,
      stack: normalizedError.stack ?? null,
      context,
    },
  ].slice(-MAX_DEBUG_ERRORS);

  try {
    window.sessionStorage.setItem(
      DEBUG_ERRORS_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch {
    // The in-memory log remains available when session storage is unavailable.
  }

  listeners.forEach((listener) => listener());
}

export function getDebugErrors() {
  return entries;
}

export function subscribeToDebugErrors(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
