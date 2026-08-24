const SESSION_KEY_STORAGE_KEY = "sessionKey";

export function initializeSessionKey() {
  try {
    const existingSessionKey = window.localStorage.getItem(
      SESSION_KEY_STORAGE_KEY,
    );

    if (existingSessionKey) {
      return existingSessionKey;
    }

    const sessionKey = window.crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY_STORAGE_KEY, sessionKey);
    return sessionKey;
  } catch {
    return window.crypto.randomUUID();
  }
}
