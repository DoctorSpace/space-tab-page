export function hasGoogleIdentityAuth() {
  return typeof chrome !== "undefined" && chrome.identity && typeof chrome.identity.getAuthToken === "function";
}

export function getGoogleAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    if (!hasGoogleIdentityAuth()) {
      reject(new Error("Google auth API unavailable"));
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime?.lastError;
      if (err || !token) {
        reject(new Error(err?.message || "Auth failed"));
        return;
      }
      resolve(token);
    });
  });
}

export function clearCachedGoogleAuthToken(token) {
  return new Promise((resolve) => {
    if (!hasGoogleIdentityAuth() || !token) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}
