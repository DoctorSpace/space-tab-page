const CURRENCY_PRESET_CODES = ["RUB", "USD", "KZT", "EUR", "CNY", "GBP", "TRY", "AED", "JPY"];
const DEFAULT_FAVORITES = ["RUB", "USD", "KZT"];
const STORAGE_KEY = "currency_converter_state";

let currencyCodesCache = null;
const currencyRatesCache = {
  base: null,
  timestamp: 0,
  date: "",
  rates: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const favorites = Array.isArray(parsed?.favorites)
      ? parsed.favorites.map((code) => String(code || "").toUpperCase()).filter(Boolean)
      : [...DEFAULT_FAVORITES];
    return {
      amount: String(parsed?.amount ?? "1000"),
      from: String(parsed?.from ?? "USD").toUpperCase(),
      to: String(parsed?.to ?? "RUB").toUpperCase(),
      favorites
    };
  } catch {
    return { amount: "1000", from: "USD", to: "RUB", favorites: [...DEFAULT_FAVORITES] };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          amount: state.amount,
          from: state.from,
          to: state.to,
          favorites: state.favorites
        })
      );
  } catch {
    // ignore storage errors
  }
}

async function getCurrencyCodes() {
  if (Array.isArray(currencyCodesCache) && currencyCodesCache.length) {
    return currencyCodesCache;
  }

  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const allCodes = Object.keys(data?.rates || {});
    if (!allCodes.includes("USD")) {
      allCodes.push("USD");
    }

    const preferred = CURRENCY_PRESET_CODES.filter((code) => allCodes.includes(code));
    const rest = allCodes
      .filter((code) => !preferred.includes(code))
      .sort((a, b) => a.localeCompare(b));

    currencyCodesCache = [...preferred, ...rest];
    return currencyCodesCache;
  } catch (error) {
    console.warn("Cannot load currency list", error);
    currencyCodesCache = [...CURRENCY_PRESET_CODES];
    return currencyCodesCache;
  }
}

async function getCurrencyRates(base) {
  const now = Date.now();
  if (
    currencyRatesCache.base === base &&
    currencyRatesCache.rates &&
    now - currencyRatesCache.timestamp < 5 * 60 * 1000
  ) {
    return currencyRatesCache;
  }

  const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.result && payload.result !== "success") {
    throw new Error(`API ${payload.result}`);
  }
  currencyRatesCache.base = base;
  currencyRatesCache.timestamp = now;
  currencyRatesCache.date = payload.time_last_update_utc || "";
  currencyRatesCache.rates = {
    ...(payload.rates || {}),
    [base]: 1
  };

  return currencyRatesCache;
}

function formatConverted(value, code) {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 4
    }).format(value);
  } catch {
    return `${value.toFixed(4)} ${code}`;
  }
}

function formatRateUpdateDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw.replace(/\s\+\d{4}$/, "");
  }

  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(parsed);

  return `${date} ${time}`;
}

export function initCurrencyConverter(header, options = {}) {
  const onOpen = typeof options.onOpen === "function" ? options.onOpen : () => {};

  const menu = header.querySelector("#currency-menu");
  const toggle = header.querySelector("#currency-menu-toggle");
  const overlay = header.querySelector("#currency-menu-overlay");
  const amountInput = header.querySelector("#currency-amount");
  const swapBtn = header.querySelector("#currency-swap");
  const resultEl = header.querySelector("#currency-result");
  const metaEl = header.querySelector("#currency-meta");
  const fromTrigger = header.querySelector("#currency-from-trigger");
  const toTrigger = header.querySelector("#currency-to-trigger");
  const fromValue = header.querySelector("#currency-from-value");
  const toValue = header.querySelector("#currency-to-value");
  const fromPanel = header.querySelector("#currency-from-panel");
  const toPanel = header.querySelector("#currency-to-panel");
  const fromQuick = header.querySelector("#currency-from-quick");
  const toQuick = header.querySelector("#currency-to-quick");
  const fromSearch = header.querySelector("#currency-from-search");
  const toSearch = header.querySelector("#currency-to-search");
  const fromList = header.querySelector("#currency-from-list");
  const toList = header.querySelector("#currency-to-list");

  if (!menu || !toggle || !overlay || !amountInput || !swapBtn || !resultEl || !metaEl) {
    return { closeMenu: () => {} };
  }

  const state = loadState();
  amountInput.value = state.amount;

  let ready = false;
  let convertToken = 0;
  let allCodes = [];
  let fromFilter = "";
  let toFilter = "";

  const positionMenu = () => {
    const toggleRect = toggle.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, toggleRect.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );
    const top = toggleRect.bottom + 8;

    menu.style.width = `${menuWidth}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  const setMeta = (headline, details = "") => {
    if (!details) {
      metaEl.textContent = headline;
      return;
    }

    metaEl.innerHTML = "";
    const headlineEl = document.createElement("div");
    headlineEl.className = "currency-menu__meta-rate";
    headlineEl.textContent = headline;

    const detailsEl = document.createElement("div");
    detailsEl.className = "currency-menu__meta-time";
    detailsEl.textContent = details;

    metaEl.append(headlineEl, detailsEl);
  };

  const closePanels = () => {
    fromPanel.hidden = true;
    toPanel.hidden = true;
    fromTrigger.setAttribute("aria-expanded", "false");
    toTrigger.setAttribute("aria-expanded", "false");
  };

  const filterCurrencyList = (target, query) => {
    const normalized = String(query || "").trim().toUpperCase();
    target.querySelectorAll(".currency-select__option-row").forEach((row) => {
      const code = row.querySelector(".currency-select__option")?.dataset.code || "";
      const isMatch = !normalized || code.includes(normalized);
      row.style.display = isMatch ? "grid" : "none";
    });
  };

  const setMenuOpen = (open) => {
    if (open) positionMenu();
    menu.classList.toggle("currency-menu--open", open);
    overlay.classList.toggle("currency-menu__overlay--open", open);
    toggle.classList.toggle("header__currency-toggle--open", open);
    if (!open) closePanels();
  };

  const setSelectedCode = (kind, code) => {
    if (!code) return;
    if (kind === "from") state.from = code;
    if (kind === "to") state.to = code;
    saveState(state);
    fromValue.textContent = state.from;
    toValue.textContent = state.to;
    paintOptions();
  };

  const paintOptions = () => {
    fromQuick.querySelectorAll(".currency-select__quick-btn").forEach((btn) => {
      btn.classList.toggle("currency-select__quick-btn--active", btn.dataset.code === state.from);
    });
    toQuick.querySelectorAll(".currency-select__quick-btn").forEach((btn) => {
      btn.classList.toggle("currency-select__quick-btn--active", btn.dataset.code === state.to);
    });
    fromList.querySelectorAll(".currency-select__option").forEach((btn) => {
      btn.classList.toggle("currency-select__option--active", btn.dataset.code === state.from);
    });
    toList.querySelectorAll(".currency-select__option").forEach((btn) => {
      btn.classList.toggle("currency-select__option--active", btn.dataset.code === state.to);
    });

    header.querySelectorAll(".currency-select__fav").forEach((btn) => {
      const isFav = state.favorites.includes(btn.dataset.code);
      btn.classList.toggle("currency-select__fav--active", isFav);
      btn.textContent = isFav ? "★" : "☆";
      btn.title = isFav ? "Убрать из избранного" : "Добавить в избранное";
    });
  };

  const renderQuick = (target, kind) => {
    const orderedQuickCodes = [...new Set(state.favorites.filter((code) => allCodes.includes(code)))];

    const html = orderedQuickCodes
      .map(
        (code) =>
          `<button class="currency-select__quick-btn" type="button" data-kind="${kind}" data-code="${code}">${code}</button>`
      )
      .join("");
    target.innerHTML = html;
  };

  const renderList = (target, kind) => {
    target.innerHTML = allCodes
      .map(
        (code) =>
          `<div class="currency-select__option-row">
            <button class="currency-select__option" type="button" role="option" data-kind="${kind}" data-code="${code}">${code}</button>
            <button class="currency-select__fav" type="button" data-action="toggle-favorite" data-code="${code}" title="Добавить в избранное">☆</button>
          </div>`
      )
      .join("");
  };

  const renderAllCurrencyOptions = () => {
    renderQuick(fromQuick, "from");
    renderQuick(toQuick, "to");
    renderList(fromList, "from");
    renderList(toList, "to");
    paintOptions();
    filterCurrencyList(fromList, fromFilter);
    filterCurrencyList(toList, toFilter);
  };

  const openPanel = (kind) => {
    const isFrom = kind === "from";
    fromPanel.hidden = !isFrom;
    toPanel.hidden = isFrom;
    fromTrigger.setAttribute("aria-expanded", String(isFrom));
    toTrigger.setAttribute("aria-expanded", String(!isFrom));
    if (isFrom) {
      fromSearch?.focus();
    } else {
      toSearch?.focus();
    }
  };

  const updateConversion = async () => {
    if (!ready) return;

    const from = state.from;
    const to = state.to;
    const amount = Number(String(state.amount).replace(",", "."));
    const currentToken = ++convertToken;

    if (!from || !to || Number.isNaN(amount)) {
      resultEl.textContent = "Некорректные данные";
      setMeta("Проверьте сумму и валюты");
      return;
    }

    if (from === to) {
      resultEl.textContent = formatConverted(amount, to);
      setMeta("Одинаковые валюты");
      return;
    }

    resultEl.textContent = "Пересчет...";
    setMeta("Обновляем курс...");

    try {
      const ratesData = await getCurrencyRates(from);
      if (currentToken !== convertToken) return;

      const rate = ratesData.rates?.[to];
      if (!rate) {
        resultEl.textContent = "Курс не найден";
        setMeta("Попробуйте другую валюту");
        return;
      }

      resultEl.textContent = formatConverted(amount * rate, to);
      setMeta(`1 ${from} = ${rate.toFixed(6)} ${to}`, formatRateUpdateDate(ratesData.date));
    } catch (error) {
      if (currentToken !== convertToken) return;
      resultEl.textContent = "Ошибка загрузки";
      setMeta("Не удалось получить курсы");
      console.warn("Currency conversion failed", error);
    }
  };

  const ensureReady = async () => {
    if (ready) return;

    allCodes = await getCurrencyCodes();

    if (!allCodes.includes(state.from)) {
      state.from = allCodes.includes("USD") ? "USD" : allCodes[0];
    }
    if (!allCodes.includes(state.to)) {
      state.to = allCodes.includes("RUB") ? "RUB" : allCodes[0];
    }
    if (state.from === state.to) {
      state.from = allCodes.includes("USD") && state.to !== "USD" ? "USD" : allCodes.find((c) => c !== state.to) || state.to;
    }

    state.favorites = state.favorites.filter((code) => allCodes.includes(code));
    renderAllCurrencyOptions();
    fromValue.textContent = state.from;
    toValue.textContent = state.to;
    closePanels();
    saveState(state);

    ready = true;
    await updateConversion();
  };

  const handleCodePick = (event) => {
    const favBtn = event.target.closest('[data-action="toggle-favorite"]');
    if (favBtn) {
      event.stopPropagation();
      const code = favBtn.dataset.code;
      if (!code) return;
      if (state.favorites.includes(code)) {
        state.favorites = state.favorites.filter((item) => item !== code);
      } else {
        state.favorites = [...state.favorites, code];
      }
      saveState(state);
      renderAllCurrencyOptions();
      return;
    }

    const option = event.target.closest("[data-code][data-kind]");
    if (!option) return;
    event.stopPropagation();
    setSelectedCode(option.dataset.kind, option.dataset.code);
    closePanels();
    updateConversion();
  };

  toggle.addEventListener("click", async () => {
    const shouldOpen = !menu.classList.contains("currency-menu--open");
    setMenuOpen(shouldOpen);
    if (!shouldOpen) return;
    onOpen();
    await ensureReady();
    updateConversion();
  });

  overlay.addEventListener("click", () => setMenuOpen(false));

  amountInput.addEventListener("input", () => {
    state.amount = amountInput.value;
    saveState(state);
    updateConversion();
  });

  fromSearch?.addEventListener("input", () => {
    fromFilter = fromSearch.value;
    filterCurrencyList(fromList, fromFilter);
  });

  toSearch?.addEventListener("input", () => {
    toFilter = toSearch.value;
    filterCurrencyList(toList, toFilter);
  });

  swapBtn.addEventListener("click", () => {
    const prevFrom = state.from;
    state.from = state.to;
    state.to = prevFrom;
    saveState(state);
    fromValue.textContent = state.from;
    toValue.textContent = state.to;
    paintOptions();
    updateConversion();
  });

  fromTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (fromPanel.hidden) {
      openPanel("from");
      return;
    }
    closePanels();
  });

  toTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (toPanel.hidden) {
      openPanel("to");
      return;
    }
    closePanels();
  });

  fromPanel.addEventListener("click", handleCodePick);
  toPanel.addEventListener("click", handleCodePick);

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("currency-menu--open")) return;
    const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (eventPath.includes(menu) || eventPath.includes(toggle)) return;
    if (event.target.closest("#currency-menu") || event.target.closest("#currency-menu-toggle")) return;
    closePanels();
    setMenuOpen(false);
  });

  window.addEventListener("resize", () => {
    if (!menu.classList.contains("currency-menu--open")) return;
    positionMenu();
  });

  return {
    closeMenu() {
      setMenuOpen(false);
    }
  };
}
