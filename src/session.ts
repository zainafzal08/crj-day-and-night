const SESSION_KEY_STORAGE_KEY = "sessionKey";
const sessionKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let inMemorySessionKey: string | null = null;

export function initializeSessionKey() {
  if (inMemorySessionKey) {
    return inMemorySessionKey;
  }

  try {
    const existingSessionKey = window.localStorage.getItem(
      SESSION_KEY_STORAGE_KEY,
    );

    if (existingSessionKey && sessionKeyPattern.test(existingSessionKey)) {
      inMemorySessionKey = existingSessionKey;
      return existingSessionKey;
    }

    const sessionKey = window.crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY_STORAGE_KEY, sessionKey);
    inMemorySessionKey = sessionKey;
    return sessionKey;
  } catch {
    inMemorySessionKey = window.crypto.randomUUID();
    return inMemorySessionKey;
  }
}
