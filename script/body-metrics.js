export const BODY_METRICS_KEY = "space_tab_body_metrics_v1";
const BODY_METRICS_COLLAPSED_KEY = "body_metrics_collapsed";

const NUMBER_FORMATS = {
  1: new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }),
  2: new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  })
};

const state = {
  range: 12,
  editingDate: "",
  pendingDeleteDate: "",
  goalMessage: "",
  message: ""
};

let messageTimer = null;
let previousFocus = null;
let reminderSignature = "";

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDate(new Date());
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return formatDate(date) === value;
}

function normalizeMetric(value, min, max, fractionDigits = 1) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(number) || number < min || number > max) return null;
  const precision = 10 ** fractionDigits;
  return Math.round(number * precision) / precision;
}

function normalizeData(data) {
  const byDate = new Map();
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  entries.forEach((entry) => {
    const date = String(entry?.date || "");
    if (!isValidDate(date)) return;
    const weight = normalizeMetric(entry.weight, 20, 500, 2);
    const waist = normalizeMetric(entry.waist, 30, 300);
    const fat = normalizeMetric(entry.fat, 1, 75);
    if (weight === null && waist === null && fat === null) return;
    byDate.set(date, { date, weight, waist, fat });
  });

  return {
    version: 3,
    goals: {
      weight: normalizeMetric(data?.goals?.weight, 20, 500, 2),
      waist: normalizeMetric(data?.goals?.waist, 30, 300),
      fat: normalizeMetric(data?.goals?.fat, 1, 75)
    },
    entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(BODY_METRICS_KEY);
    return normalizeData(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeData(null);
  }
}

function saveData(data) {
  const normalized = normalizeData(data);
  localStorage.setItem(BODY_METRICS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("space-tab:body-metrics-updated"));
  return normalized;
}

function formatValue(value, fractionDigits = 1) {
  return value === null || value === undefined ? "—" : NUMBER_FORMATS[fractionDigits].format(value);
}

function formatHumanDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatShortDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(year, month - 1, day));
}

function getMetricSeries(data, key) {
  return data.entries
    .filter((entry) => entry[key] !== null)
    .map((entry) => ({ date: entry.date, value: entry[key] }));
}

function getLatestMetric(data, key) {
  const series = getMetricSeries(data, key);
  const latest = series.at(-1) || null;
  const previous = series.at(-2) || null;
  const precision = key === "weight" ? 100 : 10;
  return {
    latest,
    delta: latest && previous ? Math.round((latest.value - previous.value) * precision) / precision : null
  };
}

function getGoalProgress(data, key) {
  const goal = data.goals[key];
  const series = getMetricSeries(data, key);
  if (goal === null || !series.length) return null;

  const start = series[0].value;
  const current = series.at(-1).value;
  if (start <= goal) return current <= goal ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((start - current) / (start - goal)) * 100)));
}

function buildDelta(delta, unit, fractionDigits = 1) {
  if (delta === null) return '<span class="body-metrics__delta body-metrics__delta--muted">нет динамики</span>';
  const direction = delta < 0 ? "down" : delta > 0 ? "up" : "flat";
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  const sign = delta > 0 ? "+" : "";
  return `<span class="body-metrics__delta body-metrics__delta--${direction}">${arrow} ${sign}${formatValue(delta, fractionDigits)} ${unit}</span>`;
}

function hasCompleteMeasurementToday(data) {
  const todayEntry = data.entries.find((entry) => entry.date === getToday());
  return Boolean(
    todayEntry &&
    todayEntry.weight !== null &&
    todayEntry.waist !== null &&
    todayEntry.fat !== null
  );
}

function shouldShowSundayReminder(data) {
  return new Date().getDay() === 0 && !hasCompleteMeasurementToday(data);
}

function isCollapsed() {
  try {
    return localStorage.getItem(BODY_METRICS_COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
}

function setCollapsed(value) {
  try {
    localStorage.setItem(BODY_METRICS_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Ignore localStorage errors; the widget will remain usable for this page.
  }
}

function showMessage(message) {
  state.message = message;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    state.message = "";
    renderWidget();
  }, 2600);
}

function saveEntry(date, weightValue, waistValue, fatValue, { replace = false, previousDate = "" } = {}) {
  const today = getToday();
  if (!isValidDate(date) || date > today) {
    return { ok: false, message: "Выберите корректную дату" };
  }

  const rawWeight = String(weightValue || "").trim();
  const rawWaist = String(waistValue || "").trim();
  const rawFat = String(fatValue || "").trim();
  const weight = normalizeMetric(rawWeight, 20, 500, 2);
  const waist = normalizeMetric(rawWaist, 30, 300);
  const fat = normalizeMetric(rawFat, 1, 75);

  if (rawWeight && weight === null) return { ok: false, message: "Вес должен быть от 20 до 500 кг" };
  if (rawWaist && waist === null) return { ok: false, message: "Талия должна быть от 30 до 300 см" };
  if (rawFat && fat === null) return { ok: false, message: "Процент жира должен быть от 1 до 75%" };
  if (weight === null && waist === null && fat === null) return { ok: false, message: "Укажите хотя бы один показатель" };

  const data = loadData();
  if (previousDate && previousDate !== date && data.entries.some((entry) => entry.date === date)) {
    return { ok: false, message: "На эту дату уже есть замер" };
  }
  const current = data.entries.find((entry) => entry.date === date);
  const nextEntry = {
    date,
    weight: weight === null && !replace ? current?.weight ?? null : weight,
    waist: waist === null && !replace ? current?.waist ?? null : waist,
    fat: fat === null && !replace ? current?.fat ?? null : fat
  };
  data.entries = data.entries.filter((entry) => entry.date !== date && entry.date !== previousDate);
  data.entries.push(nextEntry);
  saveData(data);
  return { ok: true };
}

function saveGoals(weightValue, waistValue, fatValue) {
  const rawWeight = String(weightValue || "").trim();
  const rawWaist = String(waistValue || "").trim();
  const rawFat = String(fatValue || "").trim();
  const goals = {
    weight: normalizeMetric(rawWeight, 20, 500, 2),
    waist: normalizeMetric(rawWaist, 30, 300),
    fat: normalizeMetric(rawFat, 1, 75)
  };

  if (rawWeight && goals.weight === null) return { ok: false, message: "Цель по весу должна быть от 20 до 500 кг" };
  if (rawWaist && goals.waist === null) return { ok: false, message: "Цель по талии должна быть от 30 до 300 см" };
  if (rawFat && goals.fat === null) return { ok: false, message: "Цель по жиру должна быть от 1 до 75%" };

  const data = loadData();
  for (const key of ["weight", "waist", "fat"]) {
    const latest = getLatestMetric(data, key).latest;
    if (goals[key] !== null && latest && goals[key] >= latest.value) {
      const label = { weight: "весу", waist: "талии", fat: "проценту жира" }[key];
      return { ok: false, message: `Цель по ${label} должна быть ниже текущего значения` };
    }
  }

  data.goals = goals;
  saveData(data);
  return { ok: true, message: "Цели сохранены" };
}

function buildWidgetMetric(label, metric, unit, modifier, goal, goalProgress) {
  const fractionDigits = modifier === "weight" ? 2 : 1;
  return `
    <div class="body-metrics__metric body-metrics__metric--${modifier}">
      <span class="body-metrics__metric-label">${label}</span>
      <div class="body-metrics__metric-value">
        <strong>${metric.latest ? formatValue(metric.latest.value, fractionDigits) : "—"}</strong>
        <span>${unit}</span>
      </div>
      ${buildDelta(metric.delta, unit, fractionDigits)}
      <div class="body-metrics__goal${goal !== null ? " body-metrics__goal--active" : ""}">
        <span>${goal !== null ? `Цель: ${formatValue(goal, fractionDigits)} ${unit}` : "Цель не задана"}</span>
        ${goalProgress !== null ? `<b>${goalProgress}%</b>` : ""}
      </div>
      ${goalProgress !== null ? `<div class="body-metrics__goal-track"><i style="width:${goalProgress}%"></i></div>` : ""}
    </div>
  `;
}

function renderWidget() {
  const container = document.getElementById("body-metrics");
  if (!container) return;

  const data = loadData();
  const weight = getLatestMetric(data, "weight");
  const waist = getLatestMetric(data, "waist");
  const fat = getLatestMetric(data, "fat");
  const reminder = shouldShowSundayReminder(data);
  const collapsed = isCollapsed();

  container.classList.toggle("body-metrics--collapsed", collapsed);

  container.innerHTML = `
    <div class="body-metrics__header">
      <h3 class="body-metrics__title">
        Измерения
        ${reminder ? '<span class="body-metrics__status" role="status">Нужно измерить</span>' : ""}
      </h3>
      <div class="body-metrics__actions">
        <button class="body-metrics__toggle" type="button" data-action="toggle-metrics" title="${collapsed ? "Развернуть" : "Свернуть"}">${collapsed ? "▸" : "▾"}</button>
        <button class="body-metrics__toggle" type="button" data-action="open-metrics" title="Открыть историю" aria-label="Открыть историю измерений">⤢</button>
      </div>
    </div>

    ${collapsed ? "" : `
      <div class="body-metrics__metrics">
        ${buildWidgetMetric("Вес", weight, "кг", "weight", data.goals.weight, getGoalProgress(data, "weight"))}
        ${buildWidgetMetric("Талия", waist, "см", "waist", data.goals.waist, getGoalProgress(data, "waist"))}
        ${buildWidgetMetric("Жир", fat, "%", "fat", data.goals.fat, getGoalProgress(data, "fat"))}
      </div>

      <form class="body-metrics__quick-form" id="body-metrics-quick-form">
        <label>
          <span>Вес, кг</span>
          <input name="weight" type="text" inputmode="decimal" autocomplete="off" placeholder="${weight.latest ? weight.latest.value : "75.00"}">
        </label>
        <label>
          <span>Талия, см</span>
          <input name="waist" type="number" min="30" max="300" step="0.1" inputmode="decimal" placeholder="${waist.latest ? waist.latest.value : "85.0"}">
        </label>
        <label>
          <span>Жир, %</span>
          <input name="fat" type="number" min="1" max="75" step="0.1" inputmode="decimal" placeholder="${fat.latest ? fat.latest.value : "20.0"}">
        </label>
        <button type="submit">Записать</button>
      </form>
      <div class="body-metrics__message${state.message ? " body-metrics__message--visible" : ""}" aria-live="polite">${state.message}</div>
    `}
  `;

  container.querySelector('[data-action="toggle-metrics"]')?.addEventListener("click", () => {
    setCollapsed(!collapsed);
    renderWidget();
  });
  container.querySelector('[data-action="open-metrics"]')?.addEventListener("click", openModal);
  container.querySelector("#body-metrics-quick-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = saveEntry(
      getToday(),
      formData.get("weight"),
      formData.get("waist"),
      formData.get("fat")
    );
    if (result.ok) {
      showMessage("Замер сохранен");
      renderAll();
      return;
    }

    const message = container.querySelector(".body-metrics__message");
    if (message) {
      message.textContent = result.message;
      message.classList.add("body-metrics__message--visible");
    }
  });
}

function getVisibleSeries(series) {
  return state.range === "all" ? series : series.slice(-Number(state.range));
}

function buildChart(data, key, unit, color) {
  const series = getVisibleSeries(getMetricSeries(data, key));
  if (!series.length) return '<div class="body-metrics-chart__empty">Пока нет данных для графика</div>';

  const width = 760;
  const height = 250;
  const padding = { top: 20, right: 24, bottom: 38, left: 58 };
  const values = series.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const extra = Math.max((rawMax - rawMin) * 0.16, 1);
  const min = rawMin - extra;
  const max = rawMax + extra;
  const range = max - min || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const fractionDigits = key === "weight" ? 2 : 1;
  const points = series.map((point, index) => ({
    ...point,
    x: padding.left + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth),
    y: padding.top + ((max - point.value) / range) * plotHeight
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${points.at(-1).x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + plotHeight).toFixed(1)} Z`;
  const grid = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = padding.top + ratio * plotHeight;
    const value = max - ratio * range;
    return `<g><line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line><text x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${formatValue(value, fractionDigits)}</text></g>`;
  }).join("");
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const dates = points.map((point, index) => labelIndexes.has(index)
    ? `<text x="${point.x}" y="${height - 8}" text-anchor="middle">${formatShortDate(point.date)}</text>`
    : "").join("");
  const dots = points.map((point) => `
    <circle cx="${point.x}" cy="${point.y}" r="5" tabindex="0">
      <title>${formatHumanDate(point.date)}: ${formatValue(point.value, fractionDigits)} ${unit}</title>
    </circle>
  `).join("");

  return `
    <svg class="body-metrics-chart__svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="График: ${unit}">
      <defs>
        <linearGradient id="metrics-gradient-${key}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <g class="body-metrics-chart__grid">${grid}</g>
      <path class="body-metrics-chart__area" d="${area}" fill="url(#metrics-gradient-${key})"></path>
      <path class="body-metrics-chart__line" d="${line}" style="--chart-color:${color}"></path>
      <g class="body-metrics-chart__dots" style="--chart-color:${color}">${dots}</g>
      <g class="body-metrics-chart__dates">${dates}</g>
    </svg>
  `;
}

function buildChartCard(data, key, title, unit, color) {
  const metric = getLatestMetric(data, key);
  const fractionDigits = key === "weight" ? 2 : 1;
  return `
    <section class="body-metrics-chart-card">
      <div class="body-metrics-chart-card__head">
        <div><span>${title}</span><strong>${metric.latest ? `${formatValue(metric.latest.value, fractionDigits)} ${unit}` : "Нет данных"}</strong></div>
        ${buildDelta(metric.delta, unit, fractionDigits)}
      </div>
      ${buildChart(data, key, unit, color)}
    </section>
  `;
}

function ensureModal() {
  let modal = document.getElementById("body-metrics-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "body-metrics-modal";
  modal.className = "body-metrics-modal";
  modal.innerHTML = `
    <div class="body-metrics-modal__overlay" data-action="close-metrics"></div>
    <section class="body-metrics-modal__content" role="dialog" aria-modal="true" aria-labelledby="body-metrics-modal-title">
      <header class="body-metrics-modal__header">
        <div><span>Динамика тела</span><h2 id="body-metrics-modal-title">Вес, талия и жир</h2></div>
        <button type="button" data-action="close-metrics" aria-label="Закрыть">×</button>
      </header>
      <div class="body-metrics-modal__body" id="body-metrics-modal-body"></div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", handleModalClick);
  modal.addEventListener("submit", handleModalSubmit);
  return modal;
}

function renderModal() {
  const modal = ensureModal();
  const body = modal.querySelector("#body-metrics-modal-body");
  if (!body) return;

  const data = loadData();
  const editEntry = data.entries.find((entry) => entry.date === state.editingDate);
  const formDate = state.editingDate || getToday();
  const history = [...data.entries].reverse();

  body.innerHTML = `
    <div class="body-metrics-modal__toolbar">
      <p>Отслеживайте изменения по еженедельным замерам.</p>
      <div class="body-metrics-range" role="group" aria-label="Период графика">
        ${[[12, "12 замеров"], [30, "30 замеров"], ["all", "Все"]].map(([value, label]) => `
          <button type="button" data-action="set-metrics-range" data-range="${value}" class="${String(state.range) === String(value) ? "is-active" : ""}">${label}</button>
        `).join("")}
      </div>
    </div>

    <section class="body-metrics-goals">
      <div class="body-metrics-section-head">
        <div><span>Целевые значения</span><h3>Цели для снижения</h3></div>
      </div>
      <form class="body-metrics-goals__form" id="body-metrics-goals-form">
        <label><span>Вес, кг</span><input name="weight" type="text" inputmode="decimal" autocomplete="off" value="${data.goals.weight ?? ""}" placeholder="70.00"></label>
        <label><span>Талия, см</span><input name="waist" type="number" min="30" max="300" step="0.1" inputmode="decimal" value="${data.goals.waist ?? ""}" placeholder="80.0"></label>
        <label><span>Жир, %</span><input name="fat" type="number" min="1" max="75" step="0.1" inputmode="decimal" value="${data.goals.fat ?? ""}" placeholder="15.0"></label>
        <button type="submit">Сохранить цели</button>
      </form>
      <div class="body-metrics-goals__message${state.goalMessage ? " is-visible" : ""}" aria-live="polite">${state.goalMessage || "Оставьте поле пустым, чтобы убрать цель."}</div>
    </section>

    <div class="body-metrics-charts">
      ${buildChartCard(data, "weight", "Вес", "кг", "#ffad42")}
      ${buildChartCard(data, "waist", "Талия", "см", "#54d6c5")}
      ${buildChartCard(data, "fat", "Процент жира", "%", "#b995ff")}
    </div>

    <div class="body-metrics-modal__lower">
      <section class="body-metrics-entry-card">
        <div class="body-metrics-section-head">
          <div><span>Новый замер</span><h3>${editEntry ? "Изменить запись" : "Записать показатели"}</h3></div>
          ${editEntry ? '<button type="button" data-action="cancel-metrics-edit">Отмена</button>' : ""}
        </div>
        <form class="body-metrics-entry-form" id="body-metrics-entry-form">
          <label><span>Дата</span><input name="date" type="date" max="${getToday()}" value="${formDate}" required></label>
          <label><span>Вес, кг</span><input name="weight" type="text" inputmode="decimal" autocomplete="off" value="${editEntry?.weight ?? ""}" placeholder="75.00"></label>
          <label><span>Талия, см</span><input name="waist" type="number" min="30" max="300" step="0.1" inputmode="decimal" value="${editEntry?.waist ?? ""}" placeholder="85.0"></label>
          <label><span>Жир, %</span><input name="fat" type="number" min="1" max="75" step="0.1" inputmode="decimal" value="${editEntry?.fat ?? ""}" placeholder="20.0"></label>
          <button type="submit">${editEntry ? "Сохранить" : "Добавить замер"}</button>
        </form>
        <div class="body-metrics-entry-card__hint${state.message ? " is-visible" : ""}" aria-live="polite">${state.message || "Можно заполнить один показатель и добавить остальные позже."}</div>
      </section>

      <section class="body-metrics-history">
        <div class="body-metrics-section-head"><div><span>История</span><h3>${history.length} ${history.length === 1 ? "замер" : "замеров"}</h3></div></div>
        <div class="body-metrics-history__list">
          ${history.length ? history.map((entry) => `
            <div class="body-metrics-history__row">
              <time datetime="${entry.date}">${formatHumanDate(entry.date)}</time>
              <span><b>${formatValue(entry.weight, 2)}</b> кг</span>
              <span><b>${formatValue(entry.waist)}</b> см</span>
              <span><b>${formatValue(entry.fat)}</b> %</span>
              ${state.pendingDeleteDate === entry.date ? `
                <div class="body-metrics-history__confirm" role="alert">
                  <strong>Вы уверены, что хотите удалить замер?</strong>
                  <div>
                    <button type="button" data-action="cancel-delete-metrics-entry">Отмена</button>
                    <button type="button" data-action="confirm-delete-metrics-entry" data-date="${entry.date}">Удалить</button>
                  </div>
                </div>
              ` : `
                <div>
                  <button type="button" data-action="edit-metrics-entry" data-date="${entry.date}" aria-label="Изменить замер">Изменить</button>
                  <button type="button" data-action="delete-metrics-entry" data-date="${entry.date}" aria-label="Удалить замер">×</button>
                </div>
              `}
            </div>
          `).join("") : '<div class="body-metrics-history__empty">История появится после первого замера.</div>'}
        </div>
      </section>
    </div>
  `;
}

function openModal() {
  const modal = ensureModal();
  previousFocus = document.activeElement;
  state.editingDate = "";
  state.pendingDeleteDate = "";
  state.goalMessage = "";
  state.message = "";
  renderModal();
  modal.classList.add("body-metrics-modal--open");
  document.body.classList.add("modal-open");
  document.body.style.overflow = "hidden";
  modal.querySelector('[data-action="close-metrics"]')?.focus();
}

function closeModal() {
  const modal = document.getElementById("body-metrics-modal");
  if (!modal?.classList.contains("body-metrics-modal--open")) return;
  modal.classList.remove("body-metrics-modal--open");
  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  state.editingDate = "";
  state.pendingDeleteDate = "";
  state.goalMessage = "";
  state.message = "";
  const focusTarget = previousFocus?.isConnected
    ? previousFocus
    : document.querySelector('#body-metrics [data-action="open-metrics"]');
  focusTarget?.focus();
  previousFocus = null;
}

function handleModalClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "close-metrics") {
    closeModal();
    return;
  }
  if (action === "set-metrics-range") {
    state.range = target.dataset.range === "all" ? "all" : Number(target.dataset.range);
    renderModal();
    return;
  }
  if (action === "edit-metrics-entry") {
    state.editingDate = target.dataset.date;
    state.pendingDeleteDate = "";
    state.message = "";
    renderModal();
    document.querySelector("#body-metrics-entry-form input[name='weight']")?.focus();
    return;
  }
  if (action === "cancel-metrics-edit") {
    state.editingDate = "";
    state.message = "";
    renderModal();
    return;
  }
  if (action === "delete-metrics-entry") {
    state.pendingDeleteDate = target.dataset.date;
    renderModal();
    document.querySelector('[data-action="cancel-delete-metrics-entry"]')?.focus();
    return;
  }
  if (action === "cancel-delete-metrics-entry") {
    state.pendingDeleteDate = "";
    renderModal();
    return;
  }
  if (action === "confirm-delete-metrics-entry") {
    const data = loadData();
    data.entries = data.entries.filter((entry) => entry.date !== target.dataset.date);
    saveData(data);
    if (state.editingDate === target.dataset.date) state.editingDate = "";
    state.pendingDeleteDate = "";
    renderAll();
  }
}

function handleModalSubmit(event) {
  if (event.target.id === "body-metrics-goals-form") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const result = saveGoals(
      formData.get("weight"),
      formData.get("waist"),
      formData.get("fat")
    );
    state.goalMessage = result.message;
    renderAll();
    return;
  }
  if (event.target.id !== "body-metrics-entry-form") return;
  event.preventDefault();
  const formData = new FormData(event.target);
  const editingDate = state.editingDate;
  const result = saveEntry(
    formData.get("date"),
    formData.get("weight"),
    formData.get("waist"),
    formData.get("fat"),
    { replace: Boolean(editingDate), previousDate: editingDate }
  );
  state.message = result.ok ? "Замер сохранен" : result.message;
  if (result.ok) state.editingDate = "";
  renderAll();
}

function renderAll() {
  renderWidget();
  if (document.getElementById("body-metrics-modal")?.classList.contains("body-metrics-modal--open")) {
    renderModal();
  }
}

function handleEscape(event) {
  const modal = document.getElementById("body-metrics-modal");
  if (!modal?.classList.contains("body-metrics-modal--open")) return;
  if (event.key === "Escape") {
    if (state.pendingDeleteDate) {
      state.pendingDeleteDate = "";
      renderModal();
      return;
    }
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function getBodyMetricsStateForSync() {
  return loadData();
}

export function applyBodyMetricsStateFromSync(data) {
  saveData(data);
  renderAll();
}

export function initBodyMetrics() {
  renderWidget();
  reminderSignature = `${getToday()}-${shouldShowSundayReminder(loadData())}`;
  ensureModal();
  if (!window.__bodyMetricsEscapeBound) {
    document.addEventListener("keydown", handleEscape);
    window.__bodyMetricsEscapeBound = true;
  }
  if (!window.__bodyMetricsReminderBound) {
    window.setInterval(() => {
      const nextSignature = `${getToday()}-${shouldShowSundayReminder(loadData())}`;
      if (nextSignature === reminderSignature) return;
      reminderSignature = nextSignature;
      renderWidget();
    }, 60 * 1000);
    window.__bodyMetricsReminderBound = true;
  }
}
