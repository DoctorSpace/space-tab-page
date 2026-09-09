export const FINANCE_KEY = "space_tab_finance_data";

const FINANCE_MIN_DATE = new Date(2022, 0, 1);

const defaultFinanceData = {
  accounts: [
    {
      id: "account-main",
      name: "Основной счет",
      category: "Без категории",
      color: "#7dd3fc",
      openingBalance: 0,
      archivedAt: ""
    }
  ],
  entries: {},
  snapshots: {},
  comments: {},
  categoryColors: {},
  categoryOrder: [],
  sales: []
};

const financeState = {
  selectedDate: formatDate(new Date()),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  editingCommentAccountId: null,
  activeSection: "charts",
  chartCategoryFilter: "all",
  chartAccountFilters: [],
  chartRange: "all",
  chartWidgetRange: "month",
  draggingAccountId: null,
  editMode: false,
  message: ""
};

function updateModalLock() {
  const financeOpen = document.getElementById("finance-modal")?.classList.contains("finance-modal--open");
  const calendarOpen = document.getElementById("finance-calendar-modal")?.classList.contains("finance-calendar-modal--open");
  const commentOpen = document.getElementById("finance-comment-modal")?.classList.contains("finance-comment-modal--open");
  const confirmOpen = Boolean(document.getElementById("finance-confirm"));

  if (financeOpen || calendarOpen || commentOpen || confirmOpen) {
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    return;
  }

  document.body.style.overflow = "";
  document.body.classList.remove("modal-open");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatPreciseCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(Number(value) || 0);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function formatHumanDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parseDate(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(parseDate(value));
}

function getMonthLabel(month, year) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month, 1));
}

function getStartOfCalendar(month, year) {
  const start = new Date(year, month, 1);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function sanitizeAccount(account, index = 0) {
  return {
    id: String(account?.id || `account-${Date.now()}-${index}`),
    name: String(account?.name || "Счет").trim() || "Счет",
    category: String(account?.category || account?.bank || "Без категории").trim() || "Без категории",
    openingBalance: Number.isFinite(Number(account?.openingBalance)) ? Number(account.openingBalance) : 0,
    archivedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(account?.archivedAt || "")) ? String(account.archivedAt) : ""
  };
}

function sanitizeSaleItem(item, index = 0) {
  return {
    id: String(item?.id || `sale-${Date.now()}-${index}`),
    name: String(item?.name || "").trim(),
    price: Number.isFinite(Number(item?.price)) ? Number(item.price) : 0,
    expectedPrice: Number.isFinite(Number(item?.expectedPrice)) ? Number(item.expectedPrice) : 0
  };
}

function loadFinanceData() {
  try {
    const raw = localStorage.getItem(FINANCE_KEY);
    const parsed = raw ? JSON.parse(raw) : defaultFinanceData;
    const accounts = Array.isArray(parsed?.accounts) && parsed.accounts.length
      ? parsed.accounts.map(sanitizeAccount)
      : defaultFinanceData.accounts.map(sanitizeAccount);
    const accountIds = new Set(accounts.map((account) => account.id));
    const snapshots = {};

    Object.entries(parsed?.snapshots || {}).forEach(([date, values]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !values || typeof values !== "object") return;
      const normalized = {};
      Object.entries(values).forEach(([accountId, amount]) => {
        if (!accountIds.has(accountId)) return;
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount)) return;
        normalized[accountId] = parsedAmount;
      });
      if (Object.keys(normalized).length) snapshots[date] = normalized;
    });

    const comments = {};
    Object.entries(parsed?.comments || {}).forEach(([key, value]) => {
      if (!/^\d{4}-\d{2}-\d{2}__.+$/.test(key)) return;
      comments[key] = String(value || "").trim();
    });

    const categoryColors = {};
    Object.entries(parsed?.categoryColors || {}).forEach(([key, value]) => {
      if (!key) return;
      if (!/^#[0-9a-fA-F]{6}$/.test(String(value || ""))) return;
      categoryColors[String(key)] = String(value).toUpperCase();
    });

    const accountCategories = [...new Set(accounts.map((account) => account.category || "Без категории"))];
    const categorySet = new Set(accountCategories);
    const categoryOrder = [];
    (Array.isArray(parsed?.categoryOrder) ? parsed.categoryOrder : []).forEach((category) => {
      const value = String(category || "").trim();
      if (!value || !categorySet.has(value) || categoryOrder.includes(value)) return;
      categoryOrder.push(value);
    });
    accountCategories.forEach((category) => {
      if (!categoryOrder.includes(category)) categoryOrder.push(category);
    });

    const sales = Array.isArray(parsed?.sales) ? parsed.sales.map(sanitizeSaleItem) : [];

    return { accounts, entries: {}, snapshots, comments, categoryColors, categoryOrder, sales };
  } catch {
    return JSON.parse(JSON.stringify(defaultFinanceData));
  }
}

function saveFinanceData(data) {
  localStorage.setItem(FINANCE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("space-tab:finance-updated"));
}

function getFinanceStateForSync() {
  return loadFinanceData();
}

function applyFinanceStateFromSync(payload) {
  const nextData = payload && typeof payload === "object" ? payload : defaultFinanceData;
  const normalized = (() => {
    try {
      const raw = JSON.stringify(nextData);
      localStorage.setItem(FINANCE_KEY, raw);
      return loadFinanceData();
    } catch {
      return loadFinanceData();
    }
  })();
  localStorage.setItem(FINANCE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("space-tab:finance-updated"));
  return normalized;
}

function showFinanceConfirm({ title, message, confirmLabel, danger = false, inputLabel = "", inputPlaceholder = "", inputValue = "" }) {
  if (document.getElementById("finance-confirm")) return Promise.resolve(false);

  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let closed = false;
    const confirmModal = document.createElement("div");
    confirmModal.id = "finance-confirm";
    confirmModal.className = "finance-confirm";
    confirmModal.innerHTML = `
      <div class="finance-confirm__overlay" data-confirm-action="cancel"></div>
      <section class="finance-confirm__content${danger ? " finance-confirm__content--danger" : ""}" role="alertdialog" aria-modal="true" aria-labelledby="finance-confirm-title" aria-describedby="finance-confirm-message">
        <div class="finance-confirm__icon" aria-hidden="true">${danger ? "!" : "?"}</div>
        <h3 id="finance-confirm-title">${escapeHtml(title)}</h3>
        <p id="finance-confirm-message">${escapeHtml(message)}</p>
        ${inputLabel ? `
          <label class="finance-confirm__field">
            <span>${escapeHtml(inputLabel)}</span>
            <textarea maxlength="240" rows="4" placeholder="${escapeAttribute(inputPlaceholder)}">${escapeHtml(inputValue)}</textarea>
          </label>
        ` : ""}
        <div class="finance-confirm__actions">
          <button class="finance-confirm__button" type="button" data-confirm-action="cancel">Отмена</button>
          <button class="finance-confirm__button finance-confirm__button--confirm${danger ? " finance-confirm__button--danger" : ""}" type="button" data-confirm-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    `;

    const close = (confirmed) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", keyHandler, true);
      confirmModal.remove();
      updateModalLock();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(confirmed);
    };
    const keyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...confirmModal.querySelectorAll("textarea, .finance-confirm__button")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    confirmModal.addEventListener("click", (event) => {
      const action = event.target.closest("[data-confirm-action]")?.dataset.confirmAction;
      if (action === "cancel") close(false);
      if (action === "confirm") close(inputLabel ? String(confirmModal.querySelector("textarea")?.value || "").trim() : true);
    });
    document.addEventListener("keydown", keyHandler, true);
    document.body.appendChild(confirmModal);
    updateModalLock();
    (confirmModal.querySelector("textarea") || confirmModal.querySelector('[data-confirm-action="cancel"]'))?.focus();
  });
}

function ensureFinanceModal() {
  let modal = document.getElementById("finance-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "finance-modal";
  modal.className = "finance-modal";
  modal.innerHTML = `
    <div class="finance-modal__overlay" data-action="close-finance"></div>
    <section class="finance-modal__content" role="dialog" aria-modal="true" aria-label="Финансы">
      <header class="finance-modal__header">
        <div>
          <p class="finance-modal__eyebrow">Локально на устройстве</p>
          <h2>Финансы и счета</h2>
        </div>
        <button class="finance-modal__close" type="button" data-action="close-finance" aria-label="Закрыть">×</button>
      </header>
      <div class="finance-modal__body" id="finance-modal-body"></div>
    </section>
  `;

  modal.addEventListener("click", handleFinanceModalClick);
  modal.addEventListener("input", handleFinanceModalInput);
  modal.addEventListener("change", handleFinanceModalChange);
  modal.addEventListener("submit", handleFinanceModalSubmit);
  modal.addEventListener("dragstart", handleFinanceModalDragStart);
  modal.addEventListener("dragover", handleFinanceModalDragOver);
  modal.addEventListener("drop", handleFinanceModalDrop);
  modal.addEventListener("dragend", handleFinanceModalDragEnd);
  document.body.appendChild(modal);
  return modal;
}

function openFinanceModal() {
  const modal = ensureFinanceModal();
  renderFinanceModal();
  modal.classList.add("finance-modal--open");
  updateModalLock();
}

function closeFinanceModal() {
  const modal = document.getElementById("finance-modal");
  if (!modal) return;
  modal.classList.remove("finance-modal--open");
  closeFinanceCalendarModal();
  closeFinanceCommentModal();
  financeState.editingCommentAccountId = null;
  financeState.editMode = false;
  financeState.message = "";
  updateModalLock();
}

function ensureFinanceCalendarModal() {
  let modal = document.getElementById("finance-calendar-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "finance-calendar-modal";
  modal.className = "finance-calendar-modal";
  modal.innerHTML = `
    <div class="finance-calendar-modal__overlay" data-action="close-finance-calendar"></div>
    <section class="finance-calendar-modal__content" role="dialog" aria-modal="true" aria-label="Календарь доходов">
      <header class="finance-calendar-modal__header">
        <div>
          <p class="finance-card__eyebrow">Выбор даты</p>
          <h3>Календарь доходов</h3>
        </div>
        <button class="finance-modal__close" type="button" data-action="close-finance-calendar" aria-label="Закрыть">×</button>
      </header>
      <div class="finance-calendar-modal__body" id="finance-calendar-modal-body"></div>
    </section>
  `;

  modal.addEventListener("click", handleFinanceModalClick);
  document.body.appendChild(modal);
  return modal;
}

function ensureFinanceCommentModal() {
  let modal = document.getElementById("finance-comment-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "finance-comment-modal";
  modal.className = "finance-comment-modal";
  modal.innerHTML = `
    <div class="finance-comment-modal__overlay" data-action="close-finance-comment"></div>
    <section class="finance-comment-modal__content" role="dialog" aria-modal="true" aria-label="Комментарий к счету">
      <header class="finance-comment-modal__header">
        <div id="finance-comment-modal-title"></div>
        <button class="finance-modal__close" type="button" data-action="close-finance-comment" aria-label="Закрыть">×</button>
      </header>
      <div class="finance-comment-modal__body" id="finance-comment-modal-body"></div>
    </section>
  `;

  modal.addEventListener("click", handleFinanceModalClick);
  modal.addEventListener("submit", handleFinanceModalSubmit);
  document.body.appendChild(modal);
  return modal;
}

function openFinanceCalendarModal() {
  const modal = ensureFinanceCalendarModal();
  renderFinanceCalendarModal();
  modal.classList.add("finance-calendar-modal--open");
  updateModalLock();
}

function closeFinanceCalendarModal() {
  const modal = document.getElementById("finance-calendar-modal");
  if (!modal) return;
  modal.classList.remove("finance-calendar-modal--open");
  updateModalLock();
}

function openFinanceCommentModal() {
  const modal = ensureFinanceCommentModal();
  renderFinanceCommentModal();
  modal.classList.add("finance-comment-modal--open");
  updateModalLock();
}

function closeFinanceCommentModal() {
  const modal = document.getElementById("finance-comment-modal");
  if (!modal) return;
  modal.classList.remove("finance-comment-modal--open");
  updateModalLock();
}

function getSnapshotsForDate(data, date) {
  return data.snapshots?.[date] && typeof data.snapshots[date] === "object" ? data.snapshots[date] : {};
}

function getCommentKey(date, accountId) {
  return `${date}__${accountId}`;
}

function getAccountComment(data, date, accountId) {
  return String(data.comments?.[getCommentKey(date, accountId)] || "");
}

function getAccountMap(data) {
  return new Map(data.accounts.map((account) => [account.id, account]));
}

function getSnapshotDates(data) {
  return Object.keys(data.snapshots || {}).sort();
}

function isAccountArchivedForDate(account, date) {
  return Boolean(account.archivedAt && account.archivedAt <= date);
}

function hasAccountHistoryForDate(data, account, date) {
  if (account.archivedAt && date >= account.archivedAt) return false;
  if (getSnapshotsForDate(data, date)[account.id] !== undefined) return true;
  if (getPreviousSnapshotMeta(data, account.id, date).date) return true;
  return Object.keys(data.comments || {}).some((key) => key.startsWith(`${date}__${account.id}`));
}

function getVisibleAccounts(data, date = financeState.selectedDate) {
  return data.accounts.filter((account) => !isAccountArchivedForDate(account, date) || hasAccountHistoryForDate(data, account, date));
}

function getAccountsForDate(data, date = financeState.selectedDate, options = {}) {
  const { includeArchived = false } = options;
  return data.accounts.filter((account) => {
    if (includeArchived) {
      if (isAccountArchivedForDate(account, date)) return false;
      return true;
    }
    return !isAccountArchivedForDate(account, date) || hasAccountHistoryForDate(data, account, date);
  });
}

function getAmountAtDate(data, account, date) {
  const currentAmount = getSnapshotsForDate(data, date)[account.id];
  if (Number.isFinite(currentAmount)) return currentAmount;
  return getPreviousKnownAmount(data, account.id, date);
}

function getPreviousSnapshotMeta(data, accountId, date) {
  const currentDate = String(date || "");
  let amount = Number(data.accounts.find((account) => account.id === accountId)?.openingBalance || 0);
  let snapshotDate = null;

  getSnapshotDates(data).forEach((itemDate) => {
    if (itemDate >= currentDate) return;
    const itemAmount = getSnapshotsForDate(data, itemDate)[accountId];
    if (!Number.isFinite(itemAmount)) return;
    amount = itemAmount;
    snapshotDate = itemDate;
  });

  return { amount, date: snapshotDate };
}

function getPreviousKnownAmount(data, accountId, date) {
  return getPreviousSnapshotMeta(data, accountId, date).amount;
}

function getResolvedAmountForDate(data, accountId, date) {
  const currentAmount = getSnapshotsForDate(data, date)[accountId];
  if (Number.isFinite(currentAmount)) return currentAmount;
  return getPreviousKnownAmount(data, accountId, date);
}

function hasDateActivity(data, date) {
  if (Object.keys(getSnapshotsForDate(data, date)).length) return true;
  return Object.keys(data.comments || {}).some((key) => key.startsWith(`${date}__`));
}

function getAccountTotals(data) {
  return getAccountsForDate(data, financeState.selectedDate, { includeArchived: true }).map((account) => {
    const previousMeta = getPreviousSnapshotMeta(data, account.id, financeState.selectedDate);
    const previousAmount = previousMeta.amount;
    const explicitCurrent = getSnapshotsForDate(data, financeState.selectedDate)[account.id];
    const currentAmount = getAmountAtDate(data, account, financeState.selectedDate);
    const delta = currentAmount - previousAmount;

    return {
      ...account,
      previousDate: previousMeta.date,
      previousAmount,
      currentAmount,
      explicitCurrent,
      delta,
      total: currentAmount
    };
  });
}

function getFinanceSeries(data, range = "all", options = {}) {
  const filter = options.ignoreFilters ? "all" : financeState.chartCategoryFilter;
  const accountFilters = options.ignoreFilters || !Array.isArray(financeState.chartAccountFilters) ? [] : financeState.chartAccountFilters;
  const visibleAccounts = data.accounts.filter((account) => {
    if (filter !== "all" && account.category !== filter) return false;
    if (filter !== "all" && accountFilters.length && !accountFilters.includes(account.id)) return false;
    return true;
  });
  const sortedDates = getSnapshotDates(data).filter((date) => date <= financeState.selectedDate);
  const currentByAccount = Object.fromEntries(visibleAccounts.map((account) => [account.id, Number(account.openingBalance) || 0]));
  const updateAmounts = (date) => {
    Object.entries(getSnapshotsForDate(data, date)).forEach(([accountId, amount]) => {
      const account = data.accounts.find((item) => item.id === accountId);
      if (!account || isAccountArchivedForDate(account, date)) return;
      if (filter !== "all" && account.category !== filter) return;
      if (!visibleAccounts.some((item) => item.id === accountId)) return;
      currentByAccount[accountId] = amount;
    });
  };
  const buildPoint = (date) => {
    const categories = visibleAccounts.filter((account) => !isAccountArchivedForDate(account, date)).reduce((map, account) => {
      const key = account.category || "Без категории";
      map[key] = (map[key] || 0) + (Number(currentByAccount[account.id]) || 0);
      return map;
    }, {});
    const total = Object.values(categories).reduce((sum, value) => sum + (Number(value) || 0), 0);
    return { label: date.slice(5), value: total, date, categories };
  };

  if (range === "all") {
    if (!sortedDates.length) return [buildPoint(financeState.selectedDate)];
    const series = sortedDates.map((date) => {
      updateAmounts(date);
      return buildPoint(date);
    });
    if (series[series.length - 1].date !== financeState.selectedDate) {
      series.push(buildPoint(financeState.selectedDate));
    }
    return series;
  }

  const rangeStart = getRangeStartDate(financeState.selectedDate, range);
  const series = [];
  sortedDates.filter((date) => date < rangeStart).forEach(updateAmounts);

  if (sortedDates.includes(rangeStart)) {
    updateAmounts(rangeStart);
  }
  series.push(buildPoint(rangeStart));

  sortedDates
    .filter((date) => date > rangeStart)
    .forEach((date) => {
      updateAmounts(date);
      series.push(buildPoint(date));
    });

  if (series[series.length - 1].date !== financeState.selectedDate) {
    series.push(buildPoint(financeState.selectedDate));
  }
  return series;
}

function buildCategoryOptions(data) {
  const defaults = ["Без категории", "Банк", "Маркетплейсы", "Инвестиции", "Наличные", "Подушка", "Другое"];
  const values = [...new Set([...defaults, ...data.accounts.map((account) => account.category)])].filter(Boolean);
  return `
    <datalist id="finance-category-options">
      ${values.map((value) => `<option value="${escapeAttribute(value)}"></option>`).join("")}
    </datalist>
  `;
}

function getCategoryMeta(category) {
  const value = String(category || "Без категории").trim() || "Без категории";
  const normalized = value.toLowerCase();
  if (value === "Без категории") {
    return {
      label: value,
      icon: "?",
      tone: "slate",
      color: "#94A3B8"
    };
  }
  const presets = [
    { match: ["банк", "т-банк", "сбер", "альфа", "втб"], icon: "B", tone: "sky", color: "#38bdf8" },
    { match: ["маркет", "ozon", "wb", "вайлд", "market"], icon: "M", tone: "amber", color: "#f59e0b" },
    { match: ["инвест"], icon: "I", tone: "emerald", color: "#34d399" },
    { match: ["нал", "cash"], icon: "C", tone: "slate", color: "#94a3b8" },
    { match: ["подуш", "копил"], icon: "S", tone: "violet", color: "#a78bfa" }
  ];
  const found = presets.find((item) => item.match.some((token) => normalized.includes(token)));
  return {
    label: value,
    icon: found?.icon || value.slice(0, 1).toUpperCase() || "?",
    tone: found?.tone || "sky",
    color: found?.color || "#38bdf8"
  };
}

function getCategoryColor(data, category) {
  const key = String(category || "Без категории").trim() || "Без категории";
  return data.categoryColors?.[key] || getCategoryMeta(key).color;
}

function getCategoryTextColor(color) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#F8FBFF";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0F172A" : "#F8FBFF";
}

function getCategoryList(data) {
  return [...new Set(getVisibleAccounts(data).map((account) => account.category || "Без категории"))].sort((a, b) => a.localeCompare(b, "ru"));
}

function getChartFilteredAccounts(data, date = financeState.selectedDate) {
  const categoryFilter = financeState.chartCategoryFilter;
  const accountFilters = Array.isArray(financeState.chartAccountFilters) ? financeState.chartAccountFilters : [];
  return getAccountsForDate(data, date, { includeArchived: false }).filter((account) => {
    if (categoryFilter !== "all" && account.category !== categoryFilter) return false;
    if (categoryFilter !== "all" && accountFilters.length && !accountFilters.includes(account.id)) return false;
    return true;
  });
}

function getRangeStartDate(date, range) {
  const target = new Date(parseDate(date));
  if (range === "week") target.setDate(target.getDate() - 7);
  const months = { month: 1, "3months": 3, "6months": 6, year: 12 }[range] || 0;
  if (months) {
    const day = target.getDate();
    target.setDate(1);
    target.setMonth(target.getMonth() - months);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
  }
  return formatDate(target);
}

function getRangeLabel(range) {
  return {
    week: "за неделю",
    month: "за месяц",
    "3months": "за 3 месяца",
    "6months": "за 6 месяцев",
    year: "за год"
  }[range] || "за месяц";
}

function buildChartMarkup(series, data = loadFinanceData()) {
  if (!series.length) return '<div class="finance-chart__empty">Пока нет движений по финансам</div>';

  const values = series.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, Math.max(max * 0.04, 1));
  const axisMin = min < 0 ? min - padding : Math.max(0, min - padding);
  const axisMax = max + padding;
  const range = axisMax - axisMin || 1;
  const axisSteps = 5;
  const axisValues = Array.from({ length: axisSteps }, (_, index) => {
    const ratio = (axisSteps - 1 - index) / Math.max(1, axisSteps - 1);
    return axisMin + range * ratio;
  });
  const last = series[series.length - 1];
  const points = series.map((point, index) => ({
    ...point,
    x: series.length === 1 ? 500 : (index / (series.length - 1)) * 1000,
    y: 200 - ((point.value - axisMin) / range) * 200
  }));
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    linePath += ` C ${controlX} ${previous.y} ${controlX} ${current.y} ${current.x} ${current.y}`;
  }
  const areaPath = `${linePath} L ${points[points.length - 1].x} 200 L ${points[0].x} 200 Z`;
  const labelCount = Math.min(5, points.length);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount === 1 ? 0 : Math.round((index * (points.length - 1)) / (labelCount - 1))
    )
  );
  const pointMarkup = points
    .map((point, index) => {
      const previousValue = index > 0 ? series[index - 1].value : null;
      const delta = previousValue === null ? 0 : point.value - previousValue;
      const categoryEntries = Object.entries(point.categories || {}).filter(([, value]) => value > 0);
      const tooltipCategories = categoryEntries
        .map(([category, value]) => {
          const meta = getCategoryMeta(category);
          const categoryColor = getCategoryColor(data, category);
          const categoryTextColor = getCategoryTextColor(categoryColor);
          return `<span class="finance-chart__tooltip-category"><i class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${meta.icon}</i><b>${escapeHtml(category)}</b><strong>${formatPreciseCurrency(value)}</strong></span>`;
        })
        .join("");
      const positionClass = points.length === 1 ? "" : index === 0 ? " finance-chart__point-wrap--first" : index === points.length - 1 ? " finance-chart__point-wrap--last" : "";
      return `
        <div class="finance-chart__point-wrap${positionClass}" style="--point-x:${point.x / 10}%;--point-y:${point.y / 2}%">
          <button class="finance-chart__point" type="button" aria-label="${escapeAttribute(`${formatHumanDate(point.date)}: ${formatPreciseCurrency(point.value)}`)}"></button>
          <div class="finance-chart__tooltip">
            <strong>${formatPreciseCurrency(point.value)}</strong>
            <span>${formatHumanDate(point.date)}</span>
            <em class="finance-chart__tooltip-delta ${delta > 0 ? "finance-chart__tooltip-delta--up" : delta < 0 ? "finance-chart__tooltip-delta--down" : "finance-chart__tooltip-delta--flat"}">
              ${previousValue === null ? "стартовая точка" : `${delta > 0 ? "+" : ""}${formatPreciseCurrency(delta)}`}
            </em>
            ${tooltipCategories ? `<div class="finance-chart__tooltip-categories">${tooltipCategories}</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
  const dateLabels = points
    .map((point, index) =>
      labelIndexes.has(index)
        ? `<span class="finance-chart__date${points.length === 1 ? "" : index === 0 ? " finance-chart__date--first" : index === points.length - 1 ? " finance-chart__date--last" : ""}" style="--point-x:${point.x / 10}%">${formatShortDate(point.date)}</span>`
        : ""
    )
    .join("");

  return `
    <div class="finance-chart">
      <div class="finance-chart__frame">
        <div class="finance-chart__axis">
          ${axisValues.map((value) => `<span>${formatCurrency(value)}</span>`).join("")}
        </div>
        <div class="finance-chart__plot">
          <div class="finance-chart__grid">
            ${axisValues.map(() => '<i></i>').join("")}
          </div>
          <div class="finance-chart__graph">
            <svg class="finance-chart__area" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="finance-chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.34"></stop>
                  <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02"></stop>
                </linearGradient>
              </defs>
              <path class="finance-chart__area-fill" d="${areaPath}"></path>
              <path class="finance-chart__line" d="${linePath}"></path>
            </svg>
            <div class="finance-chart__points">${pointMarkup}</div>
          </div>
          <div class="finance-chart__dates">${dateLabels}</div>
        </div>
      </div>
      <div class="finance-chart__meta">
        <span>${series[0].date}</span>
        <strong>${formatCurrency(last.value)}</strong>
        <span>${last.date}</span>
      </div>
    </div>
  `;
}

function buildCalendarMarkup(data) {
  const today = formatDate(new Date());
  const start = getStartOfCalendar(financeState.currentMonth, financeState.currentYear);
  const canGoPrev =
    financeState.currentYear > FINANCE_MIN_DATE.getFullYear() ||
    (financeState.currentYear === FINANCE_MIN_DATE.getFullYear() && financeState.currentMonth > FINANCE_MIN_DATE.getMonth());
  const canGoNext =
    financeState.currentYear < new Date().getFullYear() ||
    (financeState.currentYear === new Date().getFullYear() && financeState.currentMonth < new Date().getMonth());

  let days = "";
  const current = new Date(start);
  for (let index = 0; index < 42; index += 1) {
    const date = formatDate(current);
    const isCurrentMonth = current.getMonth() === financeState.currentMonth;
    const hasEntries = hasDateActivity(data, date);
    const isSelected = financeState.selectedDate === date;
    const isToday = date === today;
    days += `
      <button
        type="button"
        class="finance-calendar__day${isCurrentMonth ? "" : " finance-calendar__day--outside"}${isSelected ? " finance-calendar__day--selected" : ""}${isToday ? " finance-calendar__day--today" : ""}"
        data-action="select-finance-date"
        data-date="${date}"
      >
        <span>${current.getDate()}</span>
        ${hasEntries ? '<i class="finance-calendar__dot"></i>' : ""}
      </button>
    `;
    current.setDate(current.getDate() + 1);
  }

  return `
    <section class="finance-card finance-card--calendar">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">Календарь доходов</p>
          <h3>${getMonthLabel(financeState.currentMonth, financeState.currentYear)}</h3>
        </div>
        <div class="finance-calendar__navs">
          <button type="button" class="finance-calendar__nav" data-action="finance-prev-month" ${canGoPrev ? "" : "disabled"}>◀</button>
          <button type="button" class="finance-calendar__nav" data-action="finance-next-month" ${canGoNext ? "" : "disabled"}>▶</button>
        </div>
      </div>
      <div class="finance-calendar__weekdays">
        ${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="finance-calendar__grid">${days}</div>
    </section>
  `;
}

function renderFinanceCalendarModal() {
  const modal = ensureFinanceCalendarModal();
  const body = modal.querySelector("#finance-calendar-modal-body");
  if (!body) return;

  body.innerHTML = buildCalendarMarkup(loadFinanceData());
}

function renderFinanceCommentModal() {
  const modal = ensureFinanceCommentModal();
  const title = modal.querySelector("#finance-comment-modal-title");
  const body = modal.querySelector("#finance-comment-modal-body");
  const data = loadFinanceData();
  const account = data.accounts.find((item) => item.id === financeState.editingCommentAccountId);
  if (!title || !body || !account) return;

  title.innerHTML = `
    <p class="finance-card__eyebrow">Комментарий к счету</p>
    <h3>${escapeHtml(account.name)} - ${formatHumanDate(financeState.selectedDate)}</h3>
  `;

  body.innerHTML = `
    <form class="finance-comment-form" id="finance-comment-form">
      <input type="hidden" name="accountId" value="${account.id}">
      <label>
        <span>Комментарий на выбранную дату</span>
        <textarea name="comment" rows="4" maxlength="240" placeholder="Например: перевел на накопительный, снял наличные">${escapeHtml(getAccountComment(data, financeState.selectedDate, account.id))}</textarea>
      </label>
      <div class="finance-form__actions">
        <button class="finance-action" type="submit">Сохранить комментарий</button>
        <button class="finance-action finance-action--ghost" type="button" data-action="close-finance-comment">Отмена</button>
      </div>
    </form>
  `;
}

function syncSalesDraftFromDom(data) {
  const modal = document.getElementById("finance-modal");
  if (!modal) return data;
  const rows = Array.from(modal.querySelectorAll(".finance-sheet__row--sales[data-sale-id]"));
  if (!rows.length) return data;

  data.sales = rows.map((row, index) => {
    const saleId = row.dataset.saleId || `sale-${Date.now()}-${index}`;
    const name = row.querySelector('[data-field="saleName"]')?.value || "";
    const price = row.querySelector('[data-field="salePrice"]')?.value || "";
    const expectedPrice = row.querySelector('[data-field="saleExpectedPrice"]')?.value || "";
    return sanitizeSaleItem({ id: saleId, name, price, expectedPrice }, index);
  });

  return data;
}

function clearFinanceDragState() {
  financeState.draggingAccountId = null;
  clearFinanceDropTargets();
}

function clearFinanceDropTargets() {
  document.querySelectorAll(".finance-sheet__row--drag-before, .finance-sheet__row--drag-after").forEach((element) => {
    element.classList.remove("finance-sheet__row--drag-before", "finance-sheet__row--drag-after");
  });
  document.querySelectorAll(".finance-category-group--drag-over").forEach((element) => {
    element.classList.remove("finance-category-group--drag-over");
  });
}

function moveFinanceAccount(data, sourceId, { targetId = "", position = "before", category = "" } = {}) {
  if (!sourceId || sourceId === targetId) return false;
  const sourceIndex = data.accounts.findIndex((account) => account.id === sourceId);
  if (sourceIndex === -1) return false;

  const originalCategory = data.accounts[sourceIndex].category;
  const [sourceAccount] = data.accounts.splice(sourceIndex, 1);
  let insertIndex = sourceIndex;

  if (targetId) {
    const targetIndex = data.accounts.findIndex((account) => account.id === targetId);
    if (targetIndex === -1) {
      data.accounts.splice(sourceIndex, 0, sourceAccount);
      return false;
    }
    sourceAccount.category = data.accounts[targetIndex].category;
    insertIndex = targetIndex + (position === "after" ? 1 : 0);
  } else {
    const targetCategory = String(category || "").trim();
    if (!targetCategory) {
      data.accounts.splice(sourceIndex, 0, sourceAccount);
      return false;
    }
    sourceAccount.category = targetCategory;
    const lastCategoryIndex = data.accounts.reduce(
      (lastIndex, account, index) => account.category === targetCategory ? index : lastIndex,
      -1
    );
    insertIndex = lastCategoryIndex === -1 ? Math.min(sourceIndex, data.accounts.length) : lastCategoryIndex + 1;
  }

  data.accounts.splice(insertIndex, 0, sourceAccount);
  return originalCategory !== sourceAccount.category || sourceIndex !== insertIndex;
}

function moveFinanceCategory(data, category, direction, visibleCategories) {
  if (direction !== "up" && direction !== "down") return false;
  const visibleIndex = visibleCategories.indexOf(category);
  const targetVisibleIndex = visibleIndex + (direction === "up" ? -1 : direction === "down" ? 1 : 0);
  if (visibleIndex === -1 || targetVisibleIndex < 0 || targetVisibleIndex >= visibleCategories.length) return false;

  const order = Array.isArray(data.categoryOrder) ? [...data.categoryOrder] : [];
  visibleCategories.forEach((item) => {
    if (!order.includes(item)) order.push(item);
  });
  const categoryIndex = order.indexOf(category);
  const targetIndex = order.indexOf(visibleCategories[targetVisibleIndex]);
  if (categoryIndex === -1 || targetIndex === -1) return false;

  [order[categoryIndex], order[targetIndex]] = [order[targetIndex], order[categoryIndex]];
  data.categoryOrder = order;
  return true;
}

function renderFinanceHeader(data) {
  const modal = ensureFinanceModal();
  const header = modal.querySelector(".finance-modal__header");
  if (!header) return;

  const today = formatDate(new Date());
  header.innerHTML = `
    <div class="finance-modal__title-wrap">
      <div>
        <p class="finance-modal__eyebrow">Локально на устройстве</p>
        <h2>Финансы и счета</h2>
      </div>
      <div class="finance-modal__date-panel">
        <div class="finance-date-badge finance-date-badge--accent">Дата: ${formatHumanDate(financeState.selectedDate)}</div>
        <button class="finance-action finance-action--ghost" type="button" data-action="open-finance-calendar">Календарь</button>
        <button class="finance-action finance-action--ghost${financeState.selectedDate === today ? " finance-action--disabled" : ""}" type="button" data-action="finance-today" ${financeState.selectedDate === today ? "disabled" : ""}>Сегодня</button>
      </div>
    </div>
    <button class="finance-modal__close" type="button" data-action="close-finance" aria-label="Закрыть">×</button>
  `;
}

function buildAccountsMarkup(accountTotals) {
  const totalBalance = accountTotals.reduce((sum, account) => sum + account.total, 0);
  const totalDelta = accountTotals.reduce((sum, account) => sum + account.delta, 0);
  const changedAccountsCount = accountTotals.filter((account) => account.delta !== 0).length;
  const unchangedAccountsCount = accountTotals.length - changedAccountsCount;
  const data = loadFinanceData();
  const groupedAccounts = accountTotals.reduce((map, account) => {
    const key = account.category || "Без категории";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(account);
    return map;
  }, new Map());
  const categoryPositions = new Map((data.categoryOrder || []).map((category, index) => [category, index]));
  const groupedEntries = Array.from(groupedAccounts.entries()).sort((left, right) => {
    const leftIndex = categoryPositions.get(left[0]) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = categoryPositions.get(right[0]) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

  function buildDeltaMarkup(delta) {
    if (!delta) return '<span class="finance-delta finance-delta--flat">0</span>';
    const positive = delta > 0;
    return `
      <span class="finance-delta ${positive ? "finance-delta--up" : "finance-delta--down"}">
        <i>${positive ? "↑" : "↓"}</i>
        <span>${formatCurrency(Math.abs(delta))}</span>
      </span>
    `;
  }

  return `
    <section class="finance-card finance-card--accounts">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">Мои счета</p>
          <h3>Счета и накопления</h3>
        </div>
        <div class="finance-card__head-actions">
          <button class="finance-action finance-action--ghost" type="button" data-action="toggle-finance-edit">${financeState.editMode ? "Готово" : "Редактировать"}</button>
          <button class="finance-action finance-action--ghost" type="button" data-action="add-finance-account">+ Счет</button>
        </div>
      </div>
      ${buildCategoryOptions(data)}
      <div class="finance-accounts-overview">
        <div class="finance-accounts-overview__item finance-accounts-overview__date">
          <small>Дата среза</small>
          <strong>${formatHumanDate(financeState.selectedDate)}</strong>
        </div>
        <div class="finance-accounts-overview__item finance-accounts-overview__balance">
          <small>Общий баланс</small>
          <strong>${formatCurrency(totalBalance)}</strong>
        </div>
        <div class="finance-accounts-overview__item"><small>Активных счетов</small><strong>${accountTotals.length}</strong></div>
        <div class="finance-accounts-overview__item finance-accounts-overview__status--changed"><small>С изменениями</small><strong>${changedAccountsCount}</strong></div>
        <div class="finance-accounts-overview__item finance-accounts-overview__status--unchanged"><small>Без изменений</small><strong>${unchangedAccountsCount}</strong></div>
        <div class="finance-accounts-overview__item"><small>Категорий</small><strong>${groupedEntries.length}</strong></div>
      </div>
      <div class="finance-sheet-wrap">
        ${groupedEntries
          .map(
            ([categoryName, accounts], categoryIndex) => {
              const categoryMeta = getCategoryMeta(categoryName);
              const categoryColor = getCategoryColor(data, categoryName);
              const categoryTextColor = getCategoryTextColor(categoryColor);
              return `
              <section class="finance-category-group finance-category-group--${categoryMeta.tone}" data-category="${escapeAttribute(categoryName)}" style="--category-color:${categoryColor}">
                <div class="finance-category-group__head">
                  <div class="finance-category-group__title">
                    <span class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${categoryMeta.icon}</span>
                    <div class="finance-category-group__copy">
                      <h4>${escapeHtml(categoryName)}</h4>
                      <span>${accounts.length} сч. · ${formatCurrency(accounts.reduce((sum, account) => sum + account.total, 0))}</span>
                    </div>
                    ${financeState.editMode ? `
                      <span class="finance-category-group__order" role="group" aria-label="Порядок категории ${escapeAttribute(categoryName)}">
                        <button type="button" data-action="move-finance-category" data-category="${escapeAttribute(categoryName)}" data-direction="up" aria-label="Поднять категорию ${escapeAttribute(categoryName)}" title="Поднять" ${categoryIndex === 0 ? "disabled" : ""}>↑</button>
                        <button type="button" data-action="move-finance-category" data-category="${escapeAttribute(categoryName)}" data-direction="down" aria-label="Опустить категорию ${escapeAttribute(categoryName)}" title="Опустить" ${categoryIndex === groupedEntries.length - 1 ? "disabled" : ""}>↓</button>
                      </span>
                    ` : ""}
                  </div>
                  ${financeState.editMode ? `
                    <div class="finance-category-group__tools">
                      <span class="finance-category-group__drop-hint">Перетащить счет сюда</span>
                      <label class="finance-category-group__color"><span>Цвет</span><input type="color" value="${categoryColor}" data-category="${escapeAttribute(categoryName)}" data-field="categoryColor" aria-label="Цвет категории"></label>
                    </div>
                  ` : ""}
                </div>
                <div class="finance-accounts finance-sheet">
                  <div class="finance-sheet__row finance-sheet__row--head">
                    <div>Счет</div>
                    <div>Сколько на момент</div>
                    <div>Комм.</div>
                    <div></div>
                  </div>
                  ${accounts
                    .map(
              (account) => {
                const isArchived = Boolean(account.archivedAt && account.archivedAt <= financeState.selectedDate);
                return `
                <div class="finance-sheet__row${isArchived ? " finance-sheet__row--archived" : ""}${financeState.editMode && !isArchived ? " finance-sheet__row--sortable" : ""}" data-account-id="${account.id}">
                  <div class="finance-sheet__name">
                    <div class="finance-sheet__name-stack">
                      <div class="finance-sheet__name-top">${isArchived
                        ? '<span class="finance-sheet__archived-badge">Архив</span>'
                        : financeState.editMode
                          ? '<span class="finance-sheet__drag-handle" draggable="true" title="Перетащить счет">⋮⋮</span>'
                          : '<span class="finance-sheet__archived-badge finance-sheet__archived-badge--placeholder">Архив</span>'}</div>
                      <input type="text" value="${escapeAttribute(account.name)}" data-account-id="${account.id}" data-field="name" aria-label="Название счета" ${isArchived ? "disabled" : ""}>
                    </div>
                    <div class="finance-sheet__name-stack">
                      <div class="finance-sheet__name-top"></div>
                      <input type="text" value="${escapeAttribute(account.category)}" list="finance-category-options" data-account-id="${account.id}" data-field="category" aria-label="Категория счета" ${isArchived ? "disabled" : ""}>
                    </div>
                  </div>
                  <div class="finance-sheet__amount-col">
                    <div class="finance-sheet__amount-top">
                      <div class="finance-sheet__amount-meta">
                        <span class="finance-sheet__amount-label">${formatHumanDate(financeState.selectedDate)}</span>
                        <span class="finance-sheet__amount-prev">${account.previousDate ? `прошлое: ${formatHumanDate(account.previousDate)}` : "начальное значение"}</span>
                      </div>
                      ${buildDeltaMarkup(account.delta)}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value="${Number.isFinite(account.explicitCurrent) ? account.explicitCurrent : ""}"
                      placeholder="${String(account.previousAmount)}"
                      data-account-id="${account.id}"
                      data-field="currentAmount"
                      aria-label="Сколько на момент"
                      ${isArchived ? "disabled" : ""}
                    >
                  </div>
                  <div class="finance-sheet__comment-cell">
                    <button class="finance-action finance-action--ghost${getAccountComment(data, financeState.selectedDate, account.id) ? " finance-action--commented" : ""}" type="button" data-action="edit-account-comment" data-account-id="${account.id}" ${isArchived ? "disabled" : ""}>${getAccountComment(data, financeState.selectedDate, account.id) ? "Комм." : "+ комм."}</button>
                  </div>
                  <div class="finance-sheet__actions">
                    ${financeState.editMode ? isArchived
                      ? `<button class="finance-action finance-action--ghost" type="button" data-action="restore-finance-account" data-account-id="${account.id}">Вернуть</button><button class="finance-action finance-action--danger" type="button" data-action="delete-finance-account" data-account-id="${account.id}">Удалить</button>`
                      : `<button class="finance-action finance-action--ghost" type="button" data-action="archive-finance-account" data-account-id="${account.id}">В архив</button><button class="finance-action finance-action--danger" type="button" data-action="delete-finance-account" data-account-id="${account.id}">Удалить</button>`
                    : ""}
                  </div>
                </div>
              `;
            })
                    .join("")}
                </div>
              </section>
            `;
            }
          )
          .join("")}
        <div class="finance-accounts finance-sheet finance-sheet--summary">
          <div class="finance-sheet__row finance-sheet__row--summary">
            <div>Итого</div>
            <div class="finance-sheet__summary-amount">
              <span class="finance-sheet__summary-value">${formatCurrency(totalBalance)}</span>
              ${buildDeltaMarkup(totalDelta)}
            </div>
            <div></div>
            <div></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildArchiveMarkup(data) {
  const archivedAccounts = data.accounts
    .filter((account) => account.archivedAt)
    .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));

  return `
    <section class="finance-card">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">История счетов</p>
          <h3>Архив</h3>
        </div>
        <div class="finance-card__summary">${archivedAccounts.length} сч.</div>
      </div>
      ${archivedAccounts.length ? `
        <div class="finance-sheet-wrap">
          <div class="finance-accounts finance-sheet">
            <div class="finance-sheet__row finance-sheet__row--head finance-sheet__row--archive">
              <div>Счет</div>
              <div>Сумма при закрытии</div>
              <div>Дата</div>
              <div>Комментарии</div>
              <div></div>
            </div>
            ${archivedAccounts
              .map((account) => {
                const category = account.category || "Без категории";
                const categoryMeta = getCategoryMeta(category);
                const categoryColor = getCategoryColor(data, category);
                const categoryTextColor = getCategoryTextColor(categoryColor);
                const archivedAmount = getAmountAtDate(data, account, account.archivedAt);
                const comments = Object.entries(data.comments || {})
                  .filter(([key, comment]) => key.endsWith(`__${account.id}`) && comment)
                  .map(([key, comment]) => ({ date: key.slice(0, 10), comment: String(comment) }))
                  .sort((left, right) => right.date.localeCompare(left.date));
                return `
                  <div class="finance-sheet__row finance-sheet__row--archive" data-account-id="${account.id}">
                    <div class="finance-archive-account">
                      <strong>${escapeHtml(account.name)}</strong>
                      <span><i class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${categoryMeta.icon}</i>${escapeHtml(category)}</span>
                    </div>
                    <div class="finance-sheet__value finance-sheet__value--strong">${formatPreciseCurrency(archivedAmount)}</div>
                    <div class="finance-sheet__value">${formatHumanDate(account.archivedAt)}</div>
                    <div class="finance-archive-comments">
                      ${comments.length
                        ? comments.map((item) => `<div><time>${formatShortDate(item.date)}</time><span>${escapeHtml(item.comment)}</span></div>`).join("")
                        : '<span class="finance-archive-comments__empty">Нет комментариев</span>'}
                    </div>
                    <div class="finance-sheet__actions">
                      <button class="finance-action finance-action--ghost" type="button" data-action="restore-finance-account" data-account-id="${account.id}">Вернуть</button>
                      <button class="finance-action finance-action--danger" type="button" data-action="delete-finance-account" data-account-id="${account.id}">Удалить</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      ` : '<div class="finance-archive__empty">Архивных счетов пока нет</div>'}
    </section>
  `;
}

function buildFinanceSidebar() {
  const items = [
    {
      id: "charts",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 15V8M12 15V5M17 15v-3" /></svg>',
      label: "Графики"
    },
    {
      id: "statistics",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17V11M12 17V7M18 17V13M4 19h16" /></svg>',
      label: "Статистика"
    },
    {
      id: "accounts",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h16" /></svg>',
      label: "Счета"
    },
    {
      id: "archive",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></svg>',
      label: "Архив"
    },
    {
      id: "sales",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h15l-1.5 8h-11zM9 6V4M15 6V4M10 18a1 1 0 1 0 0 .01M18 18a1 1 0 1 0 0 .01" /></svg>',
      label: "Продажа"
    }
  ];

  return `
    <aside class="finance-sidebar">
      <div class="finance-sidebar__list">
        ${items
          .map(
            (item) => `
              <button
                type="button"
                class="finance-sidebar__item${financeState.activeSection === item.id ? " finance-sidebar__item--active" : ""}"
                data-action="finance-switch-section"
                data-section="${item.id}"
              >
                <span class="finance-sidebar__icon">${item.icon}</span>
                <span>${item.label}</span>
              </button>
            `
          )
          .join("")}
      </div>
    </aside>
  `;
}

function buildSalesMarkup(data) {
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const totalPrice = sales.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const totalExpectedPrice = sales.reduce((sum, item) => sum + (Number(item.expectedPrice) || 0), 0);

  return `
    <section class="finance-card finance-card--sales">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">Продажа</p>
          <h3>Товары на продажу</h3>
        </div>
        <button class="finance-action finance-action--ghost" type="button" data-action="add-sale-item">+ Товар</button>
      </div>
      <div class="finance-sheet-wrap">
        <div class="finance-accounts finance-sheet finance-sheet--sales">
          <div class="finance-sheet__row finance-sheet__row--head finance-sheet__row--sales-head">
            <div>Название товара</div>
            <div>Цена</div>
            <div>Предп. цена [продажа]</div>
            <div></div>
          </div>
          ${sales
            .map(
              (item) => `
                <div class="finance-sheet__row finance-sheet__row--sales" data-sale-id="${item.id}">
                  <div><input type="text" value="${escapeAttribute(item.name)}" data-sale-id="${item.id}" data-field="saleName" aria-label="Название товара"></div>
                  <div><input type="number" step="0.01" value="${item.price || ""}" data-sale-id="${item.id}" data-field="salePrice" aria-label="Цена"></div>
                  <div><input type="number" step="0.01" value="${item.expectedPrice || ""}" data-sale-id="${item.id}" data-field="saleExpectedPrice" aria-label="Предположительная цена продажи"></div>
                  <div class="finance-sheet__actions"><button class="finance-action finance-action--danger" type="button" data-action="delete-sale-item" data-sale-id="${item.id}">Удалить</button></div>
                </div>
              `
            )
            .join("")}
          <div class="finance-sheet__row finance-sheet__row--summary finance-sheet__row--sales">
            <div>Итог</div>
            <div class="finance-sheet__summary-value">${formatCurrency(totalPrice)}</div>
            <div class="finance-sheet__summary-value">${formatCurrency(totalExpectedPrice)}</div>
            <div></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildStatisticsMarkup(data, accountTotals, series) {
  const statisticsAccounts = accountTotals.filter((account) => !isAccountArchivedForDate(account, financeState.selectedDate));
  const categoryTotals = statisticsAccounts.reduce((map, account) => {
    map.set(account.category, (map.get(account.category) || 0) + account.total);
    return map;
  }, new Map());
  const sortedCategories = Array.from(categoryTotals.entries()).sort((left, right) => right[1] - left[1]);
  const values = series.map((item) => item.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const lastPoint = series[series.length - 1];
  const previousPoint = series.length > 1 ? series[series.length - 2] : null;
  const totalValue = statisticsAccounts.reduce((sum, account) => sum + account.total, 0);
  const previousValue = previousPoint?.value ?? totalValue;
  const totalDelta = totalValue - previousValue;
  const deltaPercent = previousValue ? (totalDelta / Math.abs(previousValue)) * 100 : 0;
  const accountsCount = statisticsAccounts.length;
  const snapshotDates = getSnapshotDates(data).filter((date) => date <= financeState.selectedDate);
  const snapshotsCount = snapshotDates.length;
  const averageValue = accountsCount ? totalValue / accountsCount : 0;
  const averageCategoryValue = categoryTotals.size ? totalValue / categoryTotals.size : 0;
  const topCategory = sortedCategories[0] || null;
  const topAccount = statisticsAccounts.slice().sort((left, right) => right.total - left.total)[0] || null;
  const archivedCount = data.accounts.filter((account) => isAccountArchivedForDate(account, financeState.selectedDate)).length;
  const historyPeriod = snapshotDates.length
    ? `${formatShortDate(snapshotDates[0])} - ${formatShortDate(snapshotDates[snapshotDates.length - 1])}`
    : "Нет данных";

  return `
    <section class="finance-card finance-card--stats">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">Сводка</p>
          <h3>Статистика по финансам</h3>
        </div>
        <div class="finance-date-badge">На ${formatHumanDate(financeState.selectedDate)}</div>
      </div>
      <div class="finance-stats-hero">
        <div class="finance-stats-hero__total">
          <small>Общий капитал</small>
          <strong>${formatCurrency(totalValue)}</strong>
          <span class="${totalDelta > 0 ? "finance-stats-value--up" : totalDelta < 0 ? "finance-stats-value--down" : "finance-stats-value--flat"}">
            ${totalDelta > 0 ? "+" : ""}${formatCurrency(totalDelta)} · ${deltaPercent > 0 ? "+" : ""}${formatPercent(deltaPercent)}%
          </span>
        </div>
        <div class="finance-stats-hero__highlights">
          <article>
            <small>Крупнейшая категория</small>
            <strong>${topCategory ? escapeHtml(topCategory[0]) : "-"}</strong>
            <span>${topCategory ? `${formatCurrency(topCategory[1])} · ${formatPercent(totalValue ? (topCategory[1] / totalValue) * 100 : 0)}%` : "Нет данных"}</span>
          </article>
          <article>
            <small>Крупнейший счет</small>
            <strong>${topAccount ? escapeHtml(topAccount.name) : "-"}</strong>
            <span>${topAccount ? formatCurrency(topAccount.total) : "Нет данных"}</span>
          </article>
          <article>
            <small>История наблюдений</small>
            <strong>${snapshotsCount} ${snapshotsCount === 1 ? "снимок" : "снимков"}</strong>
            <span>${historyPeriod}</span>
          </article>
        </div>
      </div>
      <div class="finance-stats-section-head">
        <div><small>Ключевые показатели</small><strong>Состояние портфеля</strong></div>
        <span>${accountsCount} активных · ${archivedCount} в архиве</span>
      </div>
      <div class="finance-stats-grid">
        <article><small>Активных счетов</small><strong>${accountsCount}</strong><span>В ${categoryTotals.size} категориях</span></article>
        <article><small>Архивных счетов</small><strong>${archivedCount}</strong><span>История сохранена</span></article>
        <article><small>Среднее на счет</small><strong>${formatCurrency(averageValue)}</strong><span>По активным счетам</span></article>
        <article><small>Среднее на категорию</small><strong>${formatCurrency(averageCategoryValue)}</strong><span>Текущая структура</span></article>
        <article><small>Минимум капитала</small><strong>${formatCurrency(minValue)}</strong><span>За всю историю</span></article>
        <article><small>Максимум капитала</small><strong>${formatCurrency(maxValue)}</strong><span>За всю историю</span></article>
        <article><small>Предыдущее значение</small><strong>${formatCurrency(previousValue)}</strong><span>До последнего изменения</span></article>
        <article><small>Последний снимок</small><strong>${lastPoint ? formatShortDate(lastPoint.date) : "-"}</strong><span>${lastPoint ? formatCurrency(lastPoint.value) : "Нет данных"}</span></article>
        <article><small>Период данных</small><strong>${historyPeriod}</strong><span>${snapshotsCount} точек наблюдения</span></article>
      </div>
      <div class="finance-stats-section-head finance-stats-section-head--categories">
        <div><small>Распределение капитала</small><strong>Категории</strong></div>
        <span>${formatCurrency(totalValue)}</span>
      </div>
      <div class="finance-category-stats">
        ${sortedCategories
          .map(
            ([category, total]) => {
              const meta = getCategoryMeta(category);
              const categoryColor = getCategoryColor(data, category);
              const categoryTextColor = getCategoryTextColor(categoryColor);
              const categoryAccountsCount = statisticsAccounts.filter((account) => account.category === category).length;
              const percent = totalValue ? (total / totalValue) * 100 : 0;
              return `
              <div class="finance-category-stats__item" style="--category-color:${categoryColor}">
                <div class="finance-category-stats__label"><i class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${meta.icon}</i><span>${escapeHtml(category)}</span></div>
                <strong>${formatCurrency(total)}</strong>
                <div class="finance-category-stats__bar"><i style="--category-share:${Math.min(100, Math.max(0, percent))}%"></i></div>
                <div class="finance-category-stats__meta"><span>${formatPercent(percent)}% капитала</span><span>${categoryAccountsCount} сч.</span></div>
              </div>
            `
            }
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildChartStatsWidget(data, categoryTotals) {
  const entries = Array.from(categoryTotals.entries()).filter(([, total]) => total > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (!entries.length || total <= 0) {
    return `
      <section class="finance-chart-widget finance-chart-widget--empty">
        <div>
          <p class="finance-card__eyebrow">Структура категорий</p>
          <h4>Пока нет данных для виджета</h4>
        </div>
      </section>
    `;
  }

  const sortedEntries = entries.slice().sort((a, b) => b[1] - a[1]);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gap = 4;
  let consumed = 0;
  const periodSeries = getFinanceSeries(data, financeState.chartWidgetRange);
  const periodStart = periodSeries[0] || { value: 0, categories: {} };
  const startCategoryTotals = new Map(Object.entries(periodStart.categories || {}));
  const totalStart = periodStart.value;
  const periodDelta = total - totalStart;
  const rangeOptions = [
    { id: "week", label: "7д" },
    { id: "month", label: "1м" },
    { id: "3months", label: "3м" },
    { id: "6months", label: "6м" },
    { id: "year", label: "1г" }
  ];

  const donutSegments = sortedEntries
    .map(([category, value]) => {
      const color = getCategoryColor(data, category);
      const percent = (value / total) * 100;
      const rawLength = (percent / 100) * circumference;
      const visibleLength = Math.max(rawLength - gap, 0);
      const segment = {
        category,
        value,
        color,
        length: visibleLength,
        offset: -consumed,
        textColor: getCategoryTextColor(color),
        icon: getCategoryMeta(category).icon
      };
      consumed += rawLength;
      return segment;
    })
    .filter((segment) => segment.length > 0);

  const legend = sortedEntries
    .map(([category, value]) => {
      const meta = getCategoryMeta(category);
      const color = getCategoryColor(data, category);
      const textColor = getCategoryTextColor(color);
      const delta = value - (startCategoryTotals.get(category) || 0);
      return `
        <div class="finance-chart-widget__legend-item">
          <i class="finance-category-badge" style="--category-badge-color:${color};--category-badge-text:${textColor}">${meta.icon}</i>
          <div class="finance-chart-widget__legend-copy">
            <span>${escapeHtml(category)}</span>
            <small class="finance-chart-widget__delta ${delta > 0 ? "finance-chart-widget__delta--up" : delta < 0 ? "finance-chart-widget__delta--down" : "finance-chart-widget__delta--flat"}">${delta > 0 ? "+" : ""}${formatCurrency(delta)}</small>
          </div>
          <strong>${formatCurrency(value)}</strong>
        </div>
      `;
    })
    .join("");

  const donutTooltip = sortedEntries
    .map(([category, value]) => {
      const meta = getCategoryMeta(category);
      const color = getCategoryColor(data, category);
      const textColor = getCategoryTextColor(color);
      return `
        <div class="finance-chart-widget__tooltip-row">
          <i class="finance-category-badge" style="--category-badge-color:${color};--category-badge-text:${textColor}">${meta.icon}</i>
          <span>${escapeHtml(category)}</span>
          <strong>${formatCurrency(value)}</strong>
        </div>
      `;
    })
    .join("");

  const donutMarkup = donutSegments
    .map(
      (segment) => `
        <div class="finance-chart-widget__segment" style="--segment-color:${segment.color};--segment-length:${segment.length};--segment-offset:${segment.offset}">
          <svg viewBox="0 0 120 120" class="finance-chart-widget__segment-svg" aria-hidden="true">
            <circle cx="60" cy="60" r="42" pathLength="${circumference}" />
          </svg>
        </div>
      `
    )
    .join("");

  return `
    <section class="finance-chart-widget">
      <div class="finance-chart-widget__head">
        <div>
          <p class="finance-card__eyebrow">Структура категорий</p>
          <h4>Текущий баланс по категориям</h4>
        </div>
        <div class="finance-chart-widget__controls">
          ${rangeOptions
            .map(
              (option) => `
                <button
                  type="button"
                  class="finance-chart-widget__range${financeState.chartWidgetRange === option.id ? " finance-chart-widget__range--active" : ""}"
                  data-action="finance-widget-range"
                  data-range="${option.id}"
                >${option.label}</button>
              `
            )
            .join("")}
          <div class="finance-chart-widget__chip">${entries.length} катег.</div>
        </div>
      </div>
      <div class="finance-chart-widget__body">
        <div class="finance-chart-widget__donut-wrap">
          <div class="finance-chart-widget__donut-tooltip">
            <small>На ${formatHumanDate(financeState.selectedDate)}</small>
            <strong>${formatCurrency(total)}</strong>
            <div class="finance-chart-widget__tooltip-list">${donutTooltip}</div>
          </div>
          <div class="finance-chart-widget__donut-shell"></div>
          <div class="finance-chart-widget__donut">
            ${donutMarkup}
            <div class="finance-chart-widget__center">
              <small>На дату</small>
              <strong>${formatCurrency(total)}</strong>
            </div>
          </div>
        </div>
        <div class="finance-chart-widget__meta">
          <div class="finance-chart-widget__top-category finance-chart-widget__top-category--delta">
            <div>
              <small>Изменение ${getRangeLabel(financeState.chartWidgetRange)}</small>
              <strong class="${periodDelta > 0 ? "finance-chart-widget__delta--up" : periodDelta < 0 ? "finance-chart-widget__delta--down" : "finance-chart-widget__delta--flat"}">${periodDelta > 0 ? "+" : ""}${formatCurrency(periodDelta)}</strong>
            </div>
          </div>
          <div class="finance-chart-widget__legend">${legend}</div>
        </div>
      </div>
    </section>
  `;
}

function buildChartsMarkup(data, series, accountTotals) {
  const allChartAccounts = accountTotals.filter((account) => !isAccountArchivedForDate(account, financeState.selectedDate));
  const chartAccounts = accountTotals.filter((account) => getChartFilteredAccounts(data, financeState.selectedDate).some((item) => item.id === account.id));
  const categoryTotals = chartAccounts.reduce((map, account) => {
    map.set(account.category, (map.get(account.category) || 0) + account.total);
    return map;
  }, new Map());
  const filterOptions = ["all", ...Array.from(new Set(allChartAccounts.map((account) => account.category))).sort((a, b) => String(a).localeCompare(String(b), "ru"))];
  const activeMeta = financeState.chartCategoryFilter === "all" ? null : getCategoryMeta(financeState.chartCategoryFilter);
  const availableAccounts = getAccountsForDate(data, financeState.selectedDate, { includeArchived: false }).filter(
    (account) => financeState.chartCategoryFilter !== "all" && account.category === financeState.chartCategoryFilter
  );
  const rangeOptions = [
    { id: "week", label: "7д" },
    { id: "month", label: "1м" },
    { id: "3months", label: "3м" },
    { id: "6months", label: "6м" },
    { id: "year", label: "1г" },
    { id: "all", label: "Всё" }
  ];

  return `
    <section class="finance-card finance-card--chart">
      <div class="finance-card__head">
        <div>
          <p class="finance-card__eyebrow">Общая динамика</p>
          <h3>График общего капитала</h3>
        </div>
        <div class="finance-chart__head-controls">
          <div class="finance-chart__periods" role="group" aria-label="Период графика">
            ${rangeOptions
              .map(
                (option) => `
                  <button
                    type="button"
                    class="finance-chart__period${financeState.chartRange === option.id ? " finance-chart__period--active" : ""}"
                    data-action="finance-chart-range"
                    data-range="${option.id}"
                    aria-pressed="${financeState.chartRange === option.id}"
                  >${option.label}</button>
                `
              )
              .join("")}
          </div>
          <div class="finance-card__summary">${formatCurrency(series[series.length - 1]?.value || 0)}</div>
        </div>
      </div>
      <div class="finance-chart-toolbar">
        ${filterOptions
          .map((option) => {
            const isAll = option === "all";
            const meta = isAll ? null : getCategoryMeta(option);
            const categoryColor = isAll ? "#7DD3FC" : getCategoryColor(data, option);
            const categoryTextColor = getCategoryTextColor(categoryColor);
            return `
              <button
                type="button"
                class="finance-chart-filter${financeState.chartCategoryFilter === option ? " finance-chart-filter--active" : ""}"
                style="${isAll ? "" : `--category-color:${categoryColor}`}"
                data-action="finance-filter-category"
                data-category="${escapeAttribute(option)}"
              >
                ${isAll ? '<i class="finance-chart-filter__dot"></i>' : `<i class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${meta.icon}</i>`}
                <span>${isAll ? "Все категории" : escapeHtml(option)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      ${financeState.chartCategoryFilter !== "all" ? `
        <div class="finance-chart-account-filters">
          <button type="button" class="finance-chart-account-filter${financeState.chartAccountFilters.length === 0 ? " finance-chart-account-filter--active" : ""}" data-action="finance-filter-all-accounts">Все счета</button>
          ${availableAccounts
            .map((account) => `
              <button
                type="button"
                class="finance-chart-account-filter${financeState.chartAccountFilters.includes(account.id) ? " finance-chart-account-filter--active" : ""}"
                data-action="finance-toggle-account-filter"
                data-account-id="${account.id}"
              >${escapeHtml(account.name)}</button>
            `)
            .join("")}
        </div>
      ` : ""}
      <div class="finance-chart-categories">
        ${Array.from(categoryTotals.entries())
          .map(([category, total]) => {
            const meta = getCategoryMeta(category);
            const categoryColor = getCategoryColor(data, category);
            const categoryTextColor = getCategoryTextColor(categoryColor);
            return `<div class="finance-chart-categories__item${financeState.chartCategoryFilter === category ? " finance-chart-categories__item--active" : ""}" style="--category-color:${categoryColor}"><i class="finance-category-badge" style="--category-badge-color:${categoryColor};--category-badge-text:${categoryTextColor}">${meta.icon}</i><span>${escapeHtml(category)}</span><strong>${formatCurrency(total)}</strong></div>`;
          })
          .join("")}
      </div>
      ${activeMeta ? `<div class="finance-chart-current-category"><i class="finance-category-badge" style="--category-badge-color:${getCategoryColor(data, financeState.chartCategoryFilter)};--category-badge-text:${getCategoryTextColor(getCategoryColor(data, financeState.chartCategoryFilter))}">${activeMeta.icon}</i><span>Фильтр: ${escapeHtml(financeState.chartCategoryFilter)}</span></div>` : ""}
      ${buildChartMarkup(series, data)}
    </section>
    ${buildChartStatsWidget(data, categoryTotals)}
  `;
}

function renderFinanceModal() {
  const modal = ensureFinanceModal();
  const body = modal.querySelector("#finance-modal-body");
  if (!body) return;

  const data = loadFinanceData();
  renderFinanceHeader(data);
  const accountTotals = getAccountTotals(data);
  const activeAccountTotals = accountTotals.filter((account) => !isAccountArchivedForDate(account, financeState.selectedDate));
  const totalBalance = activeAccountTotals.reduce((sum, account) => sum + account.total, 0);
  const totalDelta = activeAccountTotals.reduce((sum, account) => sum + account.delta, 0);
  const snapshotsCount = getSnapshotDates(data).length;
  const series = getFinanceSeries(data, financeState.activeSection === "charts" ? financeState.chartRange : "all", {
    ignoreFilters: financeState.activeSection === "statistics"
  });
  const visibleAccounts = activeAccountTotals;

  body.innerHTML = `
    ${financeState.message ? `<div class="finance-message">${escapeHtml(financeState.message)}</div>` : ""}
    <div class="finance-layout">
      ${buildFinanceSidebar()}
      <div class="finance-layout__content">
        ${
          financeState.activeSection === "charts"
            ? buildChartsMarkup(data, series, accountTotals)
            : financeState.activeSection === "statistics"
              ? buildStatisticsMarkup(data, accountTotals, series)
            : financeState.activeSection === "archive"
              ? buildArchiveMarkup(data)
            : financeState.activeSection === "sales"
              ? buildSalesMarkup(data)
            : buildAccountsMarkup(accountTotals)
        }
      </div>
    </div>
  `;
}

function updateSelectedMonthFromDate(value) {
  const date = parseDate(value);
  financeState.selectedDate = formatDate(date);
  financeState.currentMonth = date.getMonth();
  financeState.currentYear = date.getFullYear();
}

async function handleFinanceModalClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const data = loadFinanceData();

  if (action === "close-finance") {
    closeFinanceModal();
    return;
  }

  if (action === "open-finance-calendar") {
    openFinanceCalendarModal();
    return;
  }

  if (action === "close-finance-calendar") {
    closeFinanceCalendarModal();
    return;
  }

  if (action === "close-finance-comment") {
    closeFinanceCommentModal();
    financeState.editingCommentAccountId = null;
    return;
  }

  if (action === "finance-prev-month") {
    financeState.currentMonth -= 1;
    if (financeState.currentMonth < 0) {
      financeState.currentMonth = 11;
      financeState.currentYear -= 1;
    }
    if (document.getElementById("finance-calendar-modal")?.classList.contains("finance-calendar-modal--open")) {
      renderFinanceCalendarModal();
    } else {
      renderFinanceModal();
    }
    return;
  }

  if (action === "finance-next-month") {
    financeState.currentMonth += 1;
    if (financeState.currentMonth > 11) {
      financeState.currentMonth = 0;
      financeState.currentYear += 1;
    }
    if (document.getElementById("finance-calendar-modal")?.classList.contains("finance-calendar-modal--open")) {
      renderFinanceCalendarModal();
    } else {
      renderFinanceModal();
    }
    return;
  }

  if (action === "select-finance-date") {
    financeState.selectedDate = actionEl.dataset.date || financeState.selectedDate;
    financeState.editingCommentAccountId = null;
    closeFinanceCommentModal();
    closeFinanceCalendarModal();
    renderFinanceModal();
    return;
  }

  if (action === "finance-today") {
    updateSelectedMonthFromDate(formatDate(new Date()));
    financeState.editingCommentAccountId = null;
    closeFinanceCalendarModal();
    closeFinanceCommentModal();
    renderFinanceModal();
    return;
  }

  if (action === "toggle-finance-edit") {
    financeState.editMode = !financeState.editMode;
    renderFinanceModal();
    return;
  }

  if (action === "move-finance-category") {
    const category = String(actionEl.dataset.category || "");
    const direction = actionEl.dataset.direction;
    const visibleCategories = [...new Set(getAccountTotals(data).map((account) => account.category || "Без категории"))]
      .sort((left, right) => data.categoryOrder.indexOf(left) - data.categoryOrder.indexOf(right));
    if (!moveFinanceCategory(data, category, direction, visibleCategories)) return;
    saveFinanceData(data);
    financeState.message = `Категория «${category}» перемещена ${direction === "up" ? "выше" : "ниже"}`;
    renderFinanceModal();
    return;
  }

  if (action === "finance-switch-section") {
    const section = actionEl.dataset.section;
    if (section === "charts" || section === "accounts" || section === "archive" || section === "statistics" || section === "sales") {
      financeState.activeSection = section;
      renderFinanceModal();
    }
    return;
  }

  if (action === "finance-filter-category") {
    financeState.chartCategoryFilter = actionEl.dataset.category || "all";
    financeState.chartAccountFilters = [];
    renderFinanceModal();
    return;
  }

  if (action === "finance-filter-all-accounts") {
    financeState.chartAccountFilters = [];
    renderFinanceModal();
    return;
  }

  if (action === "finance-toggle-account-filter") {
    const accountId = actionEl.dataset.accountId || "";
    if (!accountId) return;
    const current = new Set(financeState.chartAccountFilters || []);
    if (current.has(accountId)) {
      current.delete(accountId);
    } else {
      current.add(accountId);
    }
    financeState.chartAccountFilters = Array.from(current);
    renderFinanceModal();
    return;
  }

  if (action === "finance-widget-range") {
    const range = actionEl.dataset.range;
    if (["week", "month", "3months", "6months", "year"].includes(range)) {
      financeState.chartWidgetRange = range;
      renderFinanceModal();
    }
    return;
  }

  if (action === "finance-chart-range") {
    const range = actionEl.dataset.range;
    if (["week", "month", "3months", "6months", "year", "all"].includes(range)) {
      financeState.chartRange = range;
      renderFinanceModal();
    }
    return;
  }

  if (action === "add-finance-account") {
    data.accounts.push(
      sanitizeAccount({
        id: `account-${Date.now()}`,
        name: `Счет ${data.accounts.length + 1}`,
        category: "Без категории",
        color: ["#7dd3fc", "#86efac", "#f9a8d4", "#fdba74"][data.accounts.length % 4],
        openingBalance: 0
      })
    );
    saveFinanceData(data);
    financeState.message = "Новый счет добавлен";
    renderFinanceModal();
    return;
  }

  if (action === "add-sale-item") {
    syncSalesDraftFromDom(data);
    data.sales = data.sales || [];
    data.sales.push(sanitizeSaleItem({ id: `sale-${Date.now()}`, name: "", price: 0, expectedPrice: 0 }));
    saveFinanceData(data);
    financeState.message = "Товар добавлен";
    renderFinanceModal();
    return;
  }

  if (action === "delete-sale-item") {
    syncSalesDraftFromDom(data);
    const saleId = actionEl.dataset.saleId;
    data.sales = (data.sales || []).filter((item) => item.id !== saleId);
    saveFinanceData(data);
    financeState.message = "Товар удален";
    renderFinanceModal();
    return;
  }

  if (action === "archive-finance-account") {
    const accountId = actionEl.dataset.accountId;
    if (data.accounts.filter((account) => !isAccountArchivedForDate(account, financeState.selectedDate)).length === 1) {
      financeState.message = "Хотя бы один счет должен остаться";
      renderFinanceModal();
      return;
    }
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account) return;
    const comment = await showFinanceConfirm({
      title: "Перенести счет в архив?",
      message: `Счет «${account.name}» перестанет учитываться в текущем балансе с ${formatHumanDate(financeState.selectedDate)}.`,
      confirmLabel: "В архив",
      inputLabel: "Комментарий к закрытию",
      inputPlaceholder: "Например: вклад закрыт, деньги переведены на основной счет",
      inputValue: getAccountComment(data, financeState.selectedDate, accountId)
    });
    if (comment === false) return;
    const nextData = loadFinanceData();
    const nextAccount = nextData.accounts.find((item) => item.id === accountId);
    if (!nextAccount) return;
    if (nextData.accounts.filter((item) => !isAccountArchivedForDate(item, financeState.selectedDate)).length === 1) {
      financeState.message = "Хотя бы один счет должен остаться";
      renderFinanceModal();
      return;
    }
    nextAccount.archivedAt = financeState.selectedDate;
    const commentKey = getCommentKey(financeState.selectedDate, accountId);
    if (comment) {
      nextData.comments[commentKey] = comment;
    } else {
      delete nextData.comments[commentKey];
    }
    saveFinanceData(nextData);
    financeState.message = "Счет скрыт из текущих показаний, история сохранена";
    renderFinanceModal();
    return;
  }

  if (action === "restore-finance-account") {
    const accountId = actionEl.dataset.accountId;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account) return;
    const confirmed = await showFinanceConfirm({
      title: "Вернуть счет?",
      message: `Счет «${account.name}» снова появится среди активных счетов. История останется без изменений.`,
      confirmLabel: "Вернуть"
    });
    if (!confirmed) return;
    const nextData = loadFinanceData();
    const nextAccount = nextData.accounts.find((item) => item.id === accountId);
    if (!nextAccount) return;
    nextAccount.archivedAt = "";
    saveFinanceData(nextData);
    financeState.message = "Счет восстановлен из архива";
    renderFinanceModal();
    return;
  }

  if (action === "delete-finance-account") {
    const accountId = actionEl.dataset.accountId;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account) return;
    if (data.accounts.length === 1) {
      financeState.message = "Нельзя удалить последний счет";
      renderFinanceModal();
      return;
    }
    const confirmed = await showFinanceConfirm({
      title: "Точно удалить счет?",
      message: `Счет «${account.name}», все его суммы и комментарии будут удалены без возможности восстановления.`,
      confirmLabel: "Удалить",
      danger: true
    });
    if (!confirmed) return;
    const nextData = loadFinanceData();
    const nextAccount = nextData.accounts.find((item) => item.id === accountId);
    if (!nextAccount) return;
    if (nextData.accounts.length === 1) {
      financeState.message = "Нельзя удалить последний счет";
      renderFinanceModal();
      return;
    }
    nextData.accounts = nextData.accounts.filter((item) => item.id !== accountId);
    Object.keys(nextData.snapshots || {}).forEach((date) => {
      if (nextData.snapshots[date]?.[accountId] !== undefined) delete nextData.snapshots[date][accountId];
      if (!Object.keys(nextData.snapshots[date] || {}).length) delete nextData.snapshots[date];
    });
    Object.keys(nextData.comments || {}).forEach((key) => {
      if (key.endsWith(`__${accountId}`)) delete nextData.comments[key];
    });
    saveFinanceData(nextData);
    financeState.message = nextAccount.archivedAt ? "Архивный счет удален" : "Счет удален";
    renderFinanceModal();
    return;
  }

  if (action === "edit-account-comment") {
    financeState.editingCommentAccountId = actionEl.dataset.accountId || null;
    financeState.message = "";
    openFinanceCommentModal();
    return;
  }

  if (action === "cancel-account-comment") {
    financeState.editingCommentAccountId = null;
    closeFinanceCommentModal();
    return;
  }
}

function handleFinanceModalChange(event) {
  const field = event.target.dataset.field;
  const accountId = event.target.dataset.accountId;
  if (!field) return;

  const data = loadFinanceData();

  if (field === "categoryColor") {
    const category = String(event.target.dataset.category || "").trim() || "Без категории";
    const value = String(event.target.value || "").toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) return;
    data.categoryColors = data.categoryColors || {};
    data.categoryColors[category] = value;
    financeState.message = "Цвет категории сохранен";
    saveFinanceData(data);
    renderFinanceModal();
    return;
  }

  if (!accountId) return;
  const account = data.accounts.find((item) => item.id === accountId);
  const saleId = event.target.dataset.saleId;

  if (!account && !saleId) return;

  if (saleId) {
    const sale = (data.sales || []).find((item) => item.id === saleId);
    if (!sale) return;
    if (field === "saleName") sale.name = String(event.target.value || "").trim();
    if (field === "salePrice") sale.price = Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0;
    if (field === "saleExpectedPrice") sale.expectedPrice = Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0;
    financeState.message = "Данные по продаже сохранены";
    saveFinanceData(data);
    renderFinanceModal();
    return;
  }

  if (!account) return;

  if (field === "name") {
    account.name = String(event.target.value || "").trim() || account.name;
  }
  if (field === "category") {
    const previousCategory = account.category;
    const nextCategory = String(event.target.value || "").trim() || "Без категории";
    if (previousCategory !== nextCategory) {
      const order = Array.isArray(data.categoryOrder) ? data.categoryOrder : [];
      const previousIndex = order.indexOf(previousCategory);
      const nextIndex = order.indexOf(nextCategory);
      const hasOtherPreviousAccounts = data.accounts.some((item) => item.id !== account.id && item.category === previousCategory);
      if (!hasOtherPreviousAccounts && previousIndex !== -1) {
        if (nextIndex === -1) {
          order[previousIndex] = nextCategory;
        } else {
          order.splice(previousIndex, 1);
        }
      } else if (nextIndex === -1) {
        order.splice(previousIndex === -1 ? order.length : previousIndex + 1, 0, nextCategory);
      }
      data.categoryOrder = order;
      account.category = nextCategory;
    }
  }
  if (field === "openingBalance") {
    account.openingBalance = Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0;
  }
  if (field === "currentAmount") {
    const rawValue = String(event.target.value || "").trim();
    if (!data.snapshots[financeState.selectedDate]) data.snapshots[financeState.selectedDate] = {};
    if (rawValue === "") {
      delete data.snapshots[financeState.selectedDate][accountId];
      if (!Object.keys(data.snapshots[financeState.selectedDate]).length) {
        delete data.snapshots[financeState.selectedDate];
      }
      financeState.message = "Снимок суммы очищен";
    } else {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;
      data.snapshots[financeState.selectedDate][accountId] = value;
      financeState.message = "Сумма на дату сохранена";
    }
  }
  if (field !== "currentAmount") {
    financeState.message = "Изменения по счету сохранены";
  }
  saveFinanceData(data);
  renderFinanceModal();
}

function handleFinanceModalInput(event) {
  const field = event.target.dataset.field;
  const saleId = event.target.dataset.saleId;
  if (!saleId || !field || !/^sale(Name|Price|ExpectedPrice)$/.test(field)) return;

  const data = loadFinanceData();
  const sale = (data.sales || []).find((item) => item.id === saleId);
  if (!sale) return;

  if (field === "saleName") sale.name = String(event.target.value || "");
  if (field === "salePrice") sale.price = Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0;
  if (field === "saleExpectedPrice") sale.expectedPrice = Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0;

  saveFinanceData(data);
}

function handleFinanceModalDragStart(event) {
  const handle = event.target.closest(".finance-sheet__drag-handle[draggable=\"true\"]");
  const row = handle?.closest(".finance-sheet__row--sortable[data-account-id]");
  if (!handle || !row || !financeState.editMode) return;
  financeState.draggingAccountId = row.dataset.accountId || null;
  row.classList.add("finance-sheet__row--dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", financeState.draggingAccountId || "");
  }
}

function handleFinanceModalDragOver(event) {
  const group = event.target.closest(".finance-category-group[data-category]");
  if (!group || !financeState.draggingAccountId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

  const row = event.target.closest(".finance-sheet__row--sortable[data-account-id]");
  clearFinanceDropTargets();
  if (row?.dataset.accountId === financeState.draggingAccountId) return;
  if (row) {
    const position = event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2 ? "after" : "before";
    row.classList.add(position === "after" ? "finance-sheet__row--drag-after" : "finance-sheet__row--drag-before");
    return;
  }

  group.classList.add("finance-category-group--drag-over");
}

function handleFinanceModalDrop(event) {
  const group = event.target.closest(".finance-category-group[data-category]");
  if (!group || !financeState.draggingAccountId) return;
  event.preventDefault();

  const row = event.target.closest(".finance-sheet__row--sortable[data-account-id]");
  const sourceId = financeState.draggingAccountId;
  const targetId = row?.dataset.accountId || "";
  if (targetId === sourceId) {
    clearFinanceDragState();
    return;
  }
  const position = row?.classList.contains("finance-sheet__row--drag-after") ? "after" : "before";
  const targetCategory = group.dataset.category || "Без категории";
  const data = loadFinanceData();
  const sourceAccount = data.accounts.find((account) => account.id === sourceId);
  const previousCategory = sourceAccount?.category;

  clearFinanceDragState();
  if (!moveFinanceAccount(data, sourceId, { targetId, position, category: targetCategory })) return;

  saveFinanceData(data);
  financeState.message = previousCategory === sourceAccount.category
    ? "Порядок счетов обновлен"
    : `Счет перенесен в категорию «${sourceAccount.category}»`;
  renderFinanceModal();
}

function handleFinanceModalDragEnd(event) {
  event.target.closest(".finance-sheet__row--dragging")?.classList.remove("finance-sheet__row--dragging");
  document.querySelectorAll(".finance-sheet__row--dragging").forEach((element) => {
    element.classList.remove("finance-sheet__row--dragging");
  });
  clearFinanceDragState();
}

function handleFinanceModalSubmit(event) {
  const commentForm = event.target.closest("#finance-comment-form");
  if (commentForm) {
    event.preventDefault();
    const data = loadFinanceData();
    const formData = new FormData(commentForm);
    const accountId = String(formData.get("accountId") || "");
    const comment = String(formData.get("comment") || "").trim();
    const key = getCommentKey(financeState.selectedDate, accountId);

    if (comment) {
      data.comments[key] = comment;
    } else {
      delete data.comments[key];
    }

    financeState.editingCommentAccountId = null;
    financeState.message = comment ? "Комментарий сохранен" : "Комментарий удален";
    saveFinanceData(data);
    closeFinanceCommentModal();
    renderFinanceModal();
    return;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function handleFinanceEscape(event) {
  if (event.key !== "Escape") return;
  const calendarModal = document.getElementById("finance-calendar-modal");
  if (calendarModal?.classList.contains("finance-calendar-modal--open")) {
    closeFinanceCalendarModal();
    return;
  }
  const commentModal = document.getElementById("finance-comment-modal");
  if (commentModal?.classList.contains("finance-comment-modal--open")) {
    closeFinanceCommentModal();
    financeState.editingCommentAccountId = null;
    return;
  }
  const modal = document.getElementById("finance-modal");
  if (modal?.classList.contains("finance-modal--open")) {
    closeFinanceModal();
  }
}

function initFinance() {
  const data = loadFinanceData();
  if (!data.accounts.length) {
    saveFinanceData(defaultFinanceData);
  }
  updateSelectedMonthFromDate(financeState.selectedDate);
  ensureFinanceModal();
  ensureFinanceCalendarModal();
  ensureFinanceCommentModal();
  document.addEventListener("keydown", handleFinanceEscape);
}

export { applyFinanceStateFromSync, closeFinanceModal, getFinanceStateForSync, initFinance, openFinanceModal, renderFinanceModal };
