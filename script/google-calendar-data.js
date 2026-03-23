function buildAuthorizedHeaders(token, headers = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...headers
  };
}

async function requestCalendar(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: buildAuthorizedHeaders(token, options.headers)
  });

  if (response.status === 401) {
    const error = new Error("AUTH_EXPIRED");
    error.code = "AUTH_EXPIRED";
    throw error;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Calendar request failed: ${response.status}`);
  }

  return response;
}

export async function loadCalendarList(token) {
  const response = await requestCalendar(
    token,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&showHidden=false"
  );
  const data = await response.json();

  return (data.items || []).map((calendar) => ({
    id: calendar.id,
    summary: calendar.summary || "Без названия",
    description: calendar.description || "",
    primary: Boolean(calendar.primary),
    backgroundColor: calendar.backgroundColor || "#6aa9ff",
    foregroundColor: calendar.foregroundColor || "#ffffff",
    accessRole: calendar.accessRole || "reader"
  }));
}

export async function loadCalendarEvents(token, calendarId, options = {}) {
  const {
    timeMin = new Date().toISOString(),
    maxResults = 12,
    singleEvents = true,
    orderBy = "startTime"
  } = options;

  const params = new URLSearchParams({
    timeMin,
    maxResults: String(maxResults),
    singleEvents: String(singleEvents),
    orderBy
  });

  const response = await requestCalendar(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  );
  const data = await response.json();
  return data.items || [];
}
