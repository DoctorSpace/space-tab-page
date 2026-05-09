const ICON_CACHE_NAME = "space-tab-item-icons-v1";
const ICON_CACHE_PATH = "/_icon-cache/";

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname !== ICON_CACHE_PATH) return;

  event.respondWith(getCachedIconResponse(requestUrl));
});

async function getCachedIconResponse(requestUrl) {
  const target = requestUrl.searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(target)) {
    return new Response("", { status: 400, statusText: "Invalid icon URL" });
  }

  const cache = await caches.open(ICON_CACHE_NAME);
  const cacheRequest = new Request(target, {
    mode: "no-cors",
    credentials: "omit",
    redirect: "follow"
  });

  const cached = await cache.match(cacheRequest);
  if (cached) return cached;

  try {
    const response = await fetch(cacheRequest);
    if (response.ok || response.type === "opaque") {
      await cache.put(cacheRequest, response.clone());
    }

    return response;
  } catch {
    return Response.redirect(target, 302);
  }
}
