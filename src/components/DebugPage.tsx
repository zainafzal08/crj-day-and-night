import { useSyncExternalStore } from "react";
import {
  getDebugErrors,
  subscribeToDebugErrors,
} from "../debug-errors";

export function DebugPage() {
  const errors = useSyncExternalStore(
    subscribeToDebugErrors,
    getDebugErrors,
    getDebugErrors,
  );

  return (
    <main className="debug-page" aria-label="Debug errors">
      <pre>
        <code>{JSON.stringify(errors, null, 2)}</code>
      </pre>
    </main>
  );
}
