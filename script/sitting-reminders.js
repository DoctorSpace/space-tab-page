const SETTINGS_KEY = "space_tab_sitting_reminders_v1";
const BREAK_KEY = "space_tab_sitting_break_v1";
const NEXT_DUE_KEY = "space_tab_sitting_next_due_v1";
const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DAY_NAMES = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const DEFAULT_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,
  startTime: "09:00",
  endTime: "18:00",
  days: [1, 2, 3, 4, 5]
};

function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
    return {
      enabled: stored.enabled === true,
      intervalMinutes: Number.isInteger(stored.intervalMinutes) && stored.intervalMinutes >= 1 && stored.intervalMinutes <= 1440
        ? stored.intervalMinutes : DEFAULT_SETTINGS.intervalMinutes,
      startTime: validTime(stored.startTime) ? stored.startTime : DEFAULT_SETTINGS.startTime,
      endTime: validTime(stored.endTime) ? stored.endTime : DEFAULT_SETTINGS.endTime,
      days: Array.isArray(stored.days)
        ? [...new Set(stored.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        : [...DEFAULT_SETTINGS.days]
    };
  } catch {
    return { ...DEFAULT_SETTINGS, days: [...DEFAULT_SETTINGS.days] };
  }
}

let settings = loadSettings();
let testTriggerAt = null;
let activeBreakId = null;
let previousOverflow = "";
let previousFocus = null;
const blockedElements = new Map();
let pageObserver = null;

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`
    : `${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
}

function minutesOfDay(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// For overnight ranges (e.g. 22:00–02:00), the early hours belong to the previous selected day.
function isWithinSchedule(date, options) {
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = minutesOfDay(options.startTime);
  const end = minutesOfDay(options.endTime);
  if (start === end) return options.days.includes(date.getDay());
  if (start < end) return options.days.includes(date.getDay()) && minute >= start && minute < end;
  if (minute >= start) return options.days.includes(date.getDay());
  return minute < end && options.days.includes((date.getDay() + 6) % 7);
}

function getNextDueAt() {
  const value = Number(localStorage.getItem(NEXT_DUE_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ensureNextDueAt() {
  if (!settings.enabled) return null;
  const saved = getNextDueAt();
  if (saved !== null) return saved;
  const dueAt = Date.now() + settings.intervalMinutes * 60000;
  localStorage.setItem(NEXT_DUE_KEY, String(dueAt));
  return dueAt;
}

function nextAllowedTime(from, options) {
  if (isWithinSchedule(new Date(from), options)) return from;
  const date = new Date(from);
  const start = options.startTime === options.endTime ? 0 : minutesOfDay(options.startTime);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
    if (!options.days.includes(day.getDay())) continue;
    const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(start / 60), start % 60).getTime();
    if (candidate >= from) return candidate;
  }
  return null;
}

function updateButton() {
  const button = document.getElementById("sitting-reminders-open-btn");
  button?.classList.toggle("header__sitting-btn--enabled", settings.enabled);
  button?.setAttribute("aria-label", `Настроить напоминания о перерыве (${settings.enabled ? "включены" : "выключены"})`);
}

function getActiveBreak() {
  try {
    const value = JSON.parse(localStorage.getItem(BREAK_KEY));
    return typeof value?.id === "string" && value.id ? value : null;
  } catch {
    return null;
  }
}

function blockPage(overlay) {
  for (const element of document.body.children) {
    if (element === overlay || blockedElements.has(element)) continue;
    blockedElements.set(element, element.inert);
    element.inert = true;
  }
}

function showBreak(id) {
  if (activeBreakId === id) return;
  if (activeBreakId !== null) {
    activeBreakId = id;
    return;
  }

  activeBreakId = id;
  previousOverflow = document.body.style.overflow;
  previousFocus = document.activeElement;
  const overlay = document.createElement("div");
  overlay.id = "sitting-break-screen";
  overlay.className = "sitting-break-screen";
  overlay.innerHTML = `
    <section class="sitting-break-screen__content" role="alertdialog" aria-modal="true" aria-labelledby="sitting-break-title" aria-describedby="sitting-break-description">
      <div class="sitting-break-screen__icon" aria-hidden="true">✦</div>
      <p class="sitting-break-screen__eyebrow">Пауза для движения</p>
      <h2 id="sitting-break-title">Нужно сделать перерыв</h2>
      <p id="sitting-break-description">Вы давно сидите. Встаньте, разомнитесь и немного отдохните от экрана.</p>
      <button class="sitting-break-screen__continue" type="button">Продолжить</button>
    </section>
  `;
  overlay.querySelector("button").addEventListener("click", continueAfterBreak);
  overlay.addEventListener("keydown", (event) => event.stopPropagation());
  overlay.addEventListener("keyup", (event) => event.stopPropagation());
  overlay.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(overlay);
  blockPage(overlay);
  pageObserver = new MutationObserver(() => blockPage(overlay));
  pageObserver.observe(document.body, { childList: true });
  document.body.style.overflow = "hidden";
  overlay.querySelector("button").focus();
}

function hideBreak() {
  if (activeBreakId === null) return;
  activeBreakId = null;
  pageObserver?.disconnect();
  pageObserver = null;
  document.getElementById("sitting-break-screen")?.remove();
  for (const [element, wasInert] of blockedElements) element.inert = wasInert;
  blockedElements.clear();
  document.body.style.overflow = previousOverflow;
  if (!document.hidden && previousFocus?.isConnected) previousFocus.focus();
  previousFocus = null;
}

function syncBreak() {
  const current = getActiveBreak();
  if (current) showBreak(current.id);
  else hideBreak();
  return Boolean(current);
}

function continueAfterBreak() {
  const current = getActiveBreak();
  if (current?.id === activeBreakId) {
    // Update the shared deadline before unlocking other tabs.
    if (settings.enabled && !current.test) {
      localStorage.setItem(NEXT_DUE_KEY, String(Date.now() + settings.intervalMinutes * 60000));
    }
    localStorage.removeItem(BREAK_KEY);
  }
  syncBreak();
  tick();
}

function startBreak({ test = false } = {}) {
  if (!getActiveBreak()) {
    localStorage.setItem(BREAK_KEY, JSON.stringify({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: Date.now(),
      test
    }));
  }
  syncBreak();
}

function guardBreakKeys(event) {
  const button = document.querySelector("#sitting-break-screen button");
  if (!button || (event.target === button && (event.key === "Enter" || event.key === " "))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  button.focus();
}

function updateCountdowns() {
  const modal = document.getElementById("sitting-modal");
  if (!modal?.classList.contains("sitting-modal--open")) return;

  const nextReminder = modal.querySelector("#sitting-next-reminder");
  if (!settings.enabled) {
    nextReminder.textContent = "Напоминания выключены";
  } else {
    const now = Date.now();
    const nextTime = nextAllowedTime(Math.max(now, ensureNextDueAt()), settings);
    nextReminder.textContent = nextTime === null
      ? "Выберите дни для напоминаний"
      : `До следующего перерыва: ${formatRemaining(nextTime - now)}`;
  }

  const testButton = modal.querySelector("#sitting-test-btn");
  testButton.disabled = testTriggerAt !== null;
  testButton.textContent = testTriggerAt === null
    ? "Тест через 5 сек."
    : `Тест через ${formatRemaining(testTriggerAt - Date.now())}`;
}

function startTestBreak() {
  if (testTriggerAt !== null) return;
  testTriggerAt = Date.now() + 5000;
  updateCountdowns();
  setTimeout(() => {
    testTriggerAt = null;
    startBreak({ test: true });
    updateCountdowns();
  }, 5000);
}

function tick() {
  const now = Date.now();
  if (syncBreak()) {
    updateCountdowns();
    return;
  }
  if (settings.enabled && ensureNextDueAt() <= now && isWithinSchedule(new Date(now), settings)) {
    startBreak();
  }
  updateCountdowns();
}

function closeModal() {
  const modal = document.getElementById("sitting-modal");
  if (!modal?.classList.contains("sitting-modal--open")) return;
  modal.classList.remove("sitting-modal--open");
  document.body.style.overflow = modal.dataset.previousOverflow || "";
  document.getElementById("sitting-reminders-open-btn")?.focus();
}

function createModal() {
  let modal = document.getElementById("sitting-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "sitting-modal";
  modal.className = "sitting-modal";
  modal.innerHTML = `
    <div class="sitting-modal__overlay" data-close-sitting></div>
    <section class="sitting-modal__content" role="dialog" aria-modal="true" aria-labelledby="sitting-modal-title">
      <header class="sitting-modal__header">
        <div>
          <p class="sitting-modal__eyebrow">Забота о себе</p>
          <h2 id="sitting-modal-title">Напоминания о перерыве</h2>
        </div>
        <button class="sitting-modal__close" type="button" data-close-sitting aria-label="Закрыть">×</button>
      </header>
      <form class="sitting-modal__form" id="sitting-form">
        <div class="sitting-modal__preview">
          <strong>Следующее напоминание</strong>
          <div class="sitting-modal__countdown" id="sitting-next-reminder" role="timer">—</div>
        </div>
        <label class="sitting-modal__switch-row">
          <span><strong>Включить напоминания</strong><span class="sitting-modal__hint sitting-modal__hint--block">Отсчёт не зависит от открытой вкладки</span></span>
          <span class="sitting-modal__switch"><input name="enabled" type="checkbox"><span aria-hidden="true"></span></span>
        </label>
        <label class="sitting-modal__field">
          <span>Напоминать каждые (мин.)</span>
          <input name="interval" type="number" min="1" max="1440" step="1" required>
        </label>
        <div>
          <div class="sitting-modal__range">
            <label class="sitting-modal__field"><span>С</span><input name="start" type="time" required></label>
            <label class="sitting-modal__field"><span>До</span><input name="end" type="time" required></label>
          </div>
          <p class="sitting-modal__hint">Одинаковое время — круглосуточно. Период может переходить через полночь.</p>
        </div>
        <fieldset class="sitting-modal__days">
          <legend class="sitting-modal__legend">Дни недели</legend>
          <div class="sitting-modal__day-list">
            ${[1, 2, 3, 4, 5, 6, 0].map((day) => `
              <label class="sitting-modal__day" title="${DAY_NAMES[day]}">
                <input name="day" type="checkbox" value="${day}" aria-label="${DAY_NAMES[day]}">
                <span>${DAY_LABELS[day]}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>
        <p class="sitting-modal__error" id="sitting-error" role="alert" hidden></p>
        <div class="sitting-modal__actions">
          <button class="sitting-modal__test" id="sitting-test-btn" type="button">Тест через 5 сек.</button>
          <button class="sitting-modal__save" type="submit">Сохранить</button>
        </div>
      </form>
    </section>
  `;
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-sitting]")) closeModal();
    if (event.target.closest("#sitting-test-btn")) startTestBreak();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeModal();
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button, input")].filter((element) => !element.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  modal.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const days = [...form.querySelectorAll('[name="day"]:checked')].map((input) => Number(input.value));
    const error = modal.querySelector("#sitting-error");
    if (!days.length) {
      error.textContent = "Выберите хотя бы один день недели.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const previousSettings = settings;
    settings = {
      enabled: form.elements.enabled.checked,
      intervalMinutes: Number(form.elements.interval.value),
      startTime: form.elements.start.value,
      endTime: form.elements.end.value,
      days
    };
    if (settings.enabled && (!previousSettings.enabled || previousSettings.intervalMinutes !== settings.intervalMinutes)) {
      localStorage.setItem(NEXT_DUE_KEY, String(Date.now() + settings.intervalMinutes * 60000));
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (!settings.enabled) localStorage.removeItem(NEXT_DUE_KEY);
    updateButton();
    closeModal();
    tick();
  });
  document.body.appendChild(modal);
  return modal;
}

function openSittingReminders() {
  const modal = createModal();
  const form = modal.querySelector("form");
  form.elements.enabled.checked = settings.enabled;
  form.elements.interval.value = settings.intervalMinutes;
  form.elements.start.value = settings.startTime;
  form.elements.end.value = settings.endTime;
  form.querySelectorAll('[name="day"]').forEach((input) => {
    input.checked = settings.days.includes(Number(input.value));
  });
  modal.querySelector("#sitting-error").hidden = true;
  modal.dataset.previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  modal.classList.add("sitting-modal--open");
  updateCountdowns();
  modal.querySelector(".sitting-modal__close").focus();
}

function initSittingReminders() {
  updateButton();
  syncBreak();
  ensureNextDueAt();
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", tick);
  document.addEventListener("keydown", guardBreakKeys, true);
  document.addEventListener("keyup", guardBreakKeys, true);
  window.addEventListener("focus", tick);
  window.addEventListener("pageshow", tick);
  window.addEventListener("storage", (event) => {
    if (event.key === BREAK_KEY) {
      tick();
      return;
    }
    if (event.key === SETTINGS_KEY) {
      settings = loadSettings();
      updateButton();
    }
    if (event.key === SETTINGS_KEY || event.key === NEXT_DUE_KEY) tick();
  });
  tick();
}

export { initSittingReminders, openSittingReminders };
