import { HABITS_KEY, initHabits, toggleHabits } from "./habits.js";
import { runSpeedTest } from "./speedtest.js";
import {
  loadLinksState,
  saveLinksState,
  getModeKey,
  getCategoriesByMode,
  fallbackFavicon,
  normalizeLink,
  sanitizeCategories
} from "./links-data.js";
import { hasGoogleIdentityAuth, getGoogleAuthToken, clearCachedGoogleAuthToken } from "./google-auth.js";
import { loadSpaceTabDataFromDrive, saveSpaceTabDataToDrive } from "./google-drive-data.js";
import { initCurrencyConverter } from "./currency-converter.js";

const app = document.getElementById("app");
let currentMode = "default";
let speedTestRunning = false;
let speedTestResultsTimer = null;
let editMode = false;
let editingItem = null;
let linksState = loadLinksState();
let driveSyncRunning = false;
let driveConnected = false;
let driveAutoSyncTimer = null;
let headerRef = null;
let linksNavRef = null;
let requestStatusRef = null;
let blackoutActive = false;
let iconPickerOpen = false;
let localItemIconsCache = null;
let localItemIconsLoading = false;
const itemIconPrewarmCache = new Set();
const ITEM_ICON_PREWARM_TIMEOUT = 1200;
const dragState = {
  active: false,
  sourceCategoryIndex: null,
  sourceItemIndex: null
};
const NOTES_KEY = "notes_data";

function getItemSpan(item) {
  const colSpan = Math.min(2, Math.max(1, Number(item?.colSpan || (item?.wide ? 2 : 1))));
  const rowSpan = Math.min(2, Math.max(1, Number(item?.rowSpan || 1)));
  return { colSpan, rowSpan };
}

function resolveEditorIconPreview(imgValue, linkValue) {
  const direct = String(imgValue || "").trim();
  if (direct) return getCachedItemIconUrl(direct);
  return getCachedItemIconUrl(fallbackFavicon(linkValue || "https://example.com"));
}

function getCachedItemIconUrl(iconUrl) {
  const raw = String(iconUrl || "").trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return raw;
  return chrome.runtime.getURL(`_icon-cache/?url=${encodeURIComponent(raw)}`);
}

function getItemIconSrc(item) {
  return getCachedItemIconUrl(item.img || fallbackFavicon(item.link));
}

function isCacheProxyIconUrl(url) {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return false;
  return String(url || "").startsWith(chrome.runtime.getURL("_icon-cache/"));
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

async function prewarmCurrentModeIcons() {
  const iconUrls = getCurrentCategories()
    .flatMap((category) => category.items || [])
    .map(getItemIconSrc)
    .filter((url) => isCacheProxyIconUrl(url) && !itemIconPrewarmCache.has(url));

  const uniqueUrls = [...new Set(iconUrls)];
  if (!uniqueUrls.length) return;

  uniqueUrls.forEach((url) => itemIconPrewarmCache.add(url));
  await withTimeout(
    Promise.allSettled(uniqueUrls.map((url) => fetch(url).catch(() => null))),
    ITEM_ICON_PREWARM_TIMEOUT
  );
}

function normalizeLocalIconValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/img/icons/items/")) return raw;
  if (raw.includes("/img/icons/items/")) {
    return raw.slice(raw.indexOf("/img/icons/items/"));
  }
  if (raw.startsWith("img/icons/items/")) return `/${raw}`;
  if (raw.startsWith("../img/icons/items/")) return `/${raw.slice(3)}`;
  return raw;
}

function normalizeItemBorderColor(value) {
  const raw = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : "";
}

function readDirectoryEntries(directoryEntry) {
  return new Promise((resolve, reject) => {
    const reader = directoryEntry.createReader();
    const entries = [];

    function readChunk() {
      reader.readEntries(
        (chunk) => {
          if (!chunk.length) {
            resolve(entries);
            return;
          }
          entries.push(...chunk);
          readChunk();
        },
        (error) => reject(error)
      );
    }

    readChunk();
  });
}

async function listLocalItemIcons() {
  if (Array.isArray(localItemIconsCache)) return localItemIconsCache;
  if (localItemIconsLoading) return [];
  localItemIconsLoading = true;

  try {
    const files = [];
    await new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.getPackageDirectoryEntry) {
        resolve();
        return;
      }

      chrome.runtime.getPackageDirectoryEntry(async (root) => {
        try {
          if (!root) {
            resolve();
            return;
          }

          const iconsDir = await new Promise((res, rej) => {
            root.getDirectory("img/icons/items", {}, res, rej);
          });

          async function walk(dir, prefix = "") {
            const entries = await readDirectoryEntries(dir);
            for (const entry of entries) {
              if (entry.isDirectory) {
                await walk(entry, `${prefix}${entry.name}/`);
                continue;
              }
              const relPath = `${prefix}${entry.name}`;
              if (!/\.(svg|png|jpe?g|webp|ico)$/i.test(relPath)) continue;
              files.push({
                name: entry.name,
                relPath,
                value: `/img/icons/items/${relPath}`,
                preview: chrome.runtime.getURL(`img/icons/items/${relPath}`)
              });
            }
          }

          await walk(iconsDir);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    localItemIconsCache = files.sort((a, b) => a.relPath.localeCompare(b.relPath, "ru"));
    return localItemIconsCache;
  } catch (error) {
    console.warn("Cannot list local item icons", error);
    localItemIconsCache = [];
    return localItemIconsCache;
  } finally {
    localItemIconsLoading = false;
  }
}

function ensureItemIconPickerPopover() {
  let popover = document.getElementById("item-icon-picker-popover");
  if (popover) return popover;

  popover = document.createElement("div");
  popover.id = "item-icon-picker-popover";
  popover.className = "item-icon-picker-popover";
  popover.hidden = true;
  popover.innerHTML = '<div class="item-editor__picker" id="item-editor-icon-picker"></div>';
  document.body.appendChild(popover);
  return popover;
}

function closeItemIconPicker() {
  iconPickerOpen = false;
  const popover = document.getElementById("item-icon-picker-popover");
  if (popover) popover.hidden = true;
}

function positionItemIconPickerPopover(dock, popover) {
  const dockRect = dock.getBoundingClientRect();
  const gap = 10;
  const maxWidth = 220;

  popover.style.maxWidth = `${maxWidth}px`;
  popover.style.visibility = "hidden";
  popover.hidden = false;

  const pickerWidth = Math.min(maxWidth, popover.offsetWidth || maxWidth);
  const pickerHeight = popover.offsetHeight || 220;

  const leftPreferred = dockRect.left - pickerWidth - gap;
  const left = Math.max(8, leftPreferred);
  const top = Math.max(8, Math.min(window.innerHeight - pickerHeight - 8, dockRect.top));

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.visibility = "visible";
}

function renderItemIconPicker(state = {}) {
  const popover = ensureItemIconPickerPopover();
  const picker = popover.querySelector("#item-editor-icon-picker");
  if (!picker) return;

  const { loading = false, icons = [], selected = "" } = state;
  if (loading) {
    picker.innerHTML = '<div class="item-editor__picker-empty">Загружаем иконки...</div>';
    return;
  }

  if (!icons.length) {
    picker.innerHTML = '<div class="item-editor__picker-empty">Локальные иконки не найдены</div>';
    return;
  }

  picker.innerHTML = `
    <div class="item-editor__picker-grid">
      ${icons
        .map((icon) => {
          const isActive = selected && normalizeLocalIconValue(selected) === icon.value;
          return `
            <button
              class="item-editor__picker-item${isActive ? " item-editor__picker-item--active" : ""}"
              data-action="choose-local-icon"
              data-icon-value="${icon.value}"
              title="${icon.relPath}"
              type="button"
            >
              <img src="${icon.preview}" alt="${icon.name}" loading="lazy" />
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

async function toggleItemIconPicker() {
  const dock = document.getElementById("item-editor-dock");
  if (!dock) return;

  const imgInput = dock.querySelector('[data-field="img"]');
  if (!imgInput) return;

  if (iconPickerOpen) {
    closeItemIconPicker();
    return;
  }

  iconPickerOpen = true;
  const popover = ensureItemIconPickerPopover();
  positionItemIconPickerPopover(dock, popover);

  renderItemIconPicker({ loading: true });
  const icons = await listLocalItemIcons();
  if (!iconPickerOpen) return;
  renderItemIconPicker({
    loading: false,
    icons,
    selected: imgInput.value
  });
  positionItemIconPickerPopover(dock, popover);
}

function toCellIndex(row, col) {
  return (row - 1) * 4 + (col - 1);
}

function fromCellIndex(cellIndex) {
  const safe = Math.max(0, Math.min(15, Number(cellIndex) || 0));
  return {
    row: Math.floor(safe / 4) + 1,
    col: (safe % 4) + 1
  };
}

function createEmptyGrid() {
  return Array.from({ length: 4 }, () => Array(4).fill(false));
}

function canPlace(grid, row, col, colSpan, rowSpan) {
  if (col + colSpan - 1 > 4 || row + rowSpan - 1 > 4) return false;
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      if (grid[r - 1][c - 1]) return false;
    }
  }
  return true;
}

function occupy(grid, row, col, colSpan, rowSpan) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      grid[r - 1][c - 1] = true;
    }
  }
}

function buildCategoryLayout(items) {
  const grid = createEmptyGrid();
  const placements = [];

  items.forEach((item, itemIndex) => {
    const { colSpan, rowSpan } = getItemSpan(item);
    let placed = false;

    const preferred = Number.isFinite(Number(item.gridIndex)) ? Number(item.gridIndex) : null;
    const preferredCandidates = preferred !== null ? [preferred] : [];
    const fallbackCandidates = Array.from({ length: 16 }, (_, i) => i);
    const candidates = [...preferredCandidates, ...fallbackCandidates.filter((i) => i !== preferred)];

    for (const cellIndex of candidates) {
      if (placed) break;
      const { row, col } = fromCellIndex(cellIndex);
      if (!canPlace(grid, row, col, colSpan, rowSpan)) continue;
      occupy(grid, row, col, colSpan, rowSpan);
      placements.push({ itemIndex, row, col, colSpan, rowSpan, cellIndex: toCellIndex(row, col) });
      placed = true;
    }

    if (!placed) {
      for (let row = 1; row <= 4 && !placed; row += 1) {
        for (let col = 1; col <= 4; col += 1) {
          if (!canPlace(grid, row, col, 1, 1)) continue;
          occupy(grid, row, col, 1, 1);
          placements.push({ itemIndex, row, col, colSpan: 1, rowSpan: 1, cellIndex: toCellIndex(row, col) });
          placed = true;
          break;
        }
      }
    }
  });

  const emptyCells = [];
  for (let row = 1; row <= 4; row += 1) {
    for (let col = 1; col <= 4; col += 1) {
      if (!grid[row - 1][col - 1]) {
        emptyCells.push({ row, col, cellIndex: toCellIndex(row, col) });
      }
    }
  }

  return { placements, emptyCells };
}

function getHabitsState() {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getNotesState() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function buildDrivePayload() {
  return {
    links: linksState,
    habits: getHabitsState(),
    notes: getNotesState()
  };
}

function getCurrentCategories() {
  return getCategoriesByMode(linksState, currentMode);
}

function setDriveButtonState(state = {}) {
  const button = headerRef?.querySelector("#google-drive-btn");
  const loadBtn = headerRef?.querySelector("#google-drive-load-btn");
  const logoutBtn = headerRef?.querySelector("#google-drive-logout-btn");
  if (!button) return;

  const { saving = false, connected = driveConnected, error = false } = state;
  button.classList.toggle("header__google-drive--saving", saving);
  button.classList.toggle("header__google-drive--connected", connected);
  button.classList.toggle("header__google-drive--error", error);
  if (loadBtn) {
    loadBtn.hidden = !connected;
    loadBtn.disabled = saving;
  }
  if (logoutBtn) logoutBtn.hidden = !connected || saving;

  if (saving) {
    button.textContent = "";
    button.title = "Сохранение на Google Drive";
    return;
  }

  button.textContent = connected ? "Сохранить" : "Войти";
  if (error) {
    button.title = "Ошибка Google Drive";
    return;
  }

  button.title = connected
    ? "Google Drive подключен. Нажмите для сохранения"
    : "Войти в Google и сохранить";
}

function createRequestStatusBar() {
  const bar = document.createElement("div");
  bar.id = "request-status";
  bar.className = "request-status";
  bar.innerHTML = `
    <div class="request-status__line"></div>
    <div class="request-status__text" id="request-status-text"></div>
  `;
  return bar;
}

function setRequestStatus(state, text = "") {
  if (!requestStatusRef) return;

  const textEl = requestStatusRef.querySelector("#request-status-text");
  requestStatusRef.classList.remove(
    "request-status--loading",
    "request-status--success",
    "request-status--error",
    "request-status--hide"
  );

  if (!state) {
    requestStatusRef.classList.remove("request-status--visible");
    return;
  }

  requestStatusRef.classList.add("request-status--visible", `request-status--${state}`);
  if (textEl) textEl.textContent = text;

  if (state === "success" || state === "error") {
    setTimeout(() => {
      requestStatusRef?.classList.add("request-status--hide");
      setTimeout(() => {
        requestStatusRef?.classList.remove("request-status--visible", "request-status--hide");
      }, 280);
    }, 5000);
  }
}

function showSyncToast(message, type = "success") {
  const existing = document.getElementById("drive-sync-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "drive-sync-toast";
  toast.className = `drive-sync-toast drive-sync-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("drive-sync-toast--visible"));

  setTimeout(() => {
    toast.classList.remove("drive-sync-toast--visible");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

function scheduleDriveSync(delay = 900) {
  void delay;
}

async function loginGoogle({ interactive = true }) {
  if (!hasGoogleIdentityAuth()) {
    setRequestStatus("error", "Google auth недоступен");
    showSyncToast("Google auth недоступен", "error");
    return false;
  }

  try {
    setRequestStatus("loading", "Входим в Google аккаунт...");
    await getGoogleAuthToken(interactive);
    driveConnected = true;
    setDriveButtonState({ connected: true });
    setRequestStatus("success", "Вход в Google выполнен");
    showSyncToast("Вход в Google выполнен", "success");
    return true;
  } catch (error) {
    console.error("Google login failed", error);
    setDriveButtonState({ error: true, connected: false });
    setRequestStatus("error", "Ошибка входа в Google");
    showSyncToast("Ошибка входа в Google", "error");
    setTimeout(() => setDriveButtonState({ connected: false }), 1400);
    return false;
  }
}

function confirmSaveModal() {
  return new Promise((resolve) => {
    const existing = document.getElementById("confirm-save-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "confirm-save-modal";
    modal.className = "confirm-save-modal";
    modal.innerHTML = `
      <div class="confirm-save-modal__overlay"></div>
      <div class="confirm-save-modal__content" role="dialog" aria-modal="true" aria-label="Подтверждение сохранения">
        <h3>Сохранить в Google Drive?</h3>
        <p>Уверены? Файл будет перезаписан и сохранен на диск.</p>
        <div class="confirm-save-modal__actions">
          <button class="confirm-save-modal__btn" data-action="no">Нет</button>
          <button class="confirm-save-modal__btn confirm-save-modal__btn--yes" data-action="yes">Да</button>
        </div>
      </div>
    `;

    const close = (value) => {
      modal.remove();
      resolve(value);
    };

    modal.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-action]");
      if (actionEl?.dataset.action === "yes") close(true);
      if (actionEl?.dataset.action === "no") close(false);
      if (event.target.classList.contains("confirm-save-modal__overlay")) close(false);
    });

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") close(false);
      },
      { once: true }
    );

    document.body.appendChild(modal);
  });
}

async function syncToDrive({ interactive, notify = false }) {
  if (driveSyncRunning) return;

  if (!hasGoogleIdentityAuth()) {
    setDriveButtonState({ error: true, connected: false });
    setTimeout(() => setDriveButtonState({ connected: false }), 1400);
    return;
  }

  driveSyncRunning = true;
  setDriveButtonState({ saving: true, connected: driveConnected });
  setRequestStatus("loading", "Сохраняем данные в Google Drive...");

  try {
    let token = await getGoogleAuthToken(interactive);
    let driveResult = null;
    try {
      driveResult = await saveSpaceTabDataToDrive(token, buildDrivePayload());
    } catch (error) {
      if (error?.code === "AUTH_EXPIRED" || String(error?.message).includes("AUTH_EXPIRED")) {
        await clearCachedGoogleAuthToken(token);
        token = await getGoogleAuthToken(true);
        driveResult = await saveSpaceTabDataToDrive(token, buildDrivePayload());
      } else {
        throw error;
      }
    }

    driveConnected = true;
    console.info("Drive sync success", driveResult);
    setDriveButtonState({ connected: true });
    setRequestStatus("success", "Сохранение в Google Drive завершено");
    if (interactive || notify) {
      showSyncToast("Успешно сохранено в Google Drive", "success");
    }
  } catch (error) {
    console.error("Drive sync failed", error);
    setDriveButtonState({ error: true, connected: driveConnected });
    setRequestStatus("error", "Ошибка сохранения в Google Drive");
    setTimeout(() => setDriveButtonState({ connected: driveConnected }), 1400);
    if (interactive || notify) {
      showSyncToast("Ошибка сохранения в Google Drive", "error");
    }
  } finally {
    driveSyncRunning = false;
  }
}

async function loadFromDrive({ interactive }) {
  if (!hasGoogleIdentityAuth()) {
    showSyncToast("Google auth недоступен", "error");
    return;
  }

  try {
    setRequestStatus("loading", "Загружаем данные из Google Drive...");
    let token = await getGoogleAuthToken(interactive);
    let result = null;
    try {
      result = await loadSpaceTabDataFromDrive(token);
    } catch (error) {
      if (error?.code === "AUTH_EXPIRED" || String(error?.message).includes("AUTH_EXPIRED")) {
        await clearCachedGoogleAuthToken(token);
        token = await getGoogleAuthToken(true);
        result = await loadSpaceTabDataFromDrive(token);
      } else {
        throw error;
      }
    }

    driveConnected = true;
    setDriveButtonState({ connected: true });

    if (!result?.data) {
      showSyncToast("Файл не найден в Google Drive", "error");
      return;
    }

    if (result.data.links) {
      linksState = result.data.links;
      saveLinksState(linksState);
    }
    if (result.data.habits) {
      localStorage.setItem(HABITS_KEY, JSON.stringify(result.data.habits));
      window.dispatchEvent(new CustomEvent("space-tab:habits-updated"));
    }
    if (result.data.notes) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(result.data.notes));
      window.dispatchEvent(new CustomEvent("space-tab:notes-restored"));
    }

    renderCategories();
    initHabits();
    setRequestStatus("success", "Загрузка из Google Drive завершена");
    showSyncToast("Файл загружен из Google Drive", "success");
  } catch (error) {
    console.error("Drive load failed", error);
    setRequestStatus("error", "Ошибка загрузки из Google Drive");
    showSyncToast("Ошибка загрузки из Google Drive", "error");
  }
}

async function disconnectGoogleDrive() {
  if (!hasGoogleIdentityAuth()) return;

  if (driveAutoSyncTimer) {
    clearTimeout(driveAutoSyncTimer);
    driveAutoSyncTimer = null;
  }

  try {
    setRequestStatus("loading", "Выход из Google аккаунта...");
    const token = await getGoogleAuthToken(false);
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
    } catch {}
    await clearCachedGoogleAuthToken(token);
  } catch {}

  driveConnected = false;
  setDriveButtonState({ connected: false });
  setRequestStatus("success", "Вы вышли из Google аккаунта");
  showSyncToast("Вы вышли из Google аккаунта", "success");
}

function initDriveButtonState() {
  if (!hasGoogleIdentityAuth()) {
    setDriveButtonState({ connected: false });
    return;
  }

  getGoogleAuthToken(false)
    .then(() => {
      driveConnected = true;
      setDriveButtonState({ connected: true });
    })
    .catch(() => {
      driveConnected = false;
      setDriveButtonState({ connected: false });
    });
}

function saveLinksAndSync() {
  saveLinksState(linksState);
  scheduleDriveSync();
}

function toggleEditMode() {
  editMode = !editMode;
  if (!editMode) editingItem = null;
  updateEditControlsState();
  renderCategories();
}

function updateEditControlsState() {
  const editBtn = linksNavRef?.querySelector("#edit-links-btn");
  const addCategoryBtn = linksNavRef?.querySelector("#add-category-btn");
  if (!editBtn || !addCategoryBtn || !linksNavRef) return;

  editBtn.textContent = editMode ? "Готово" : "Редактировать";
  editBtn.classList.toggle("links-nav__edit-btn--active", editMode);
  addCategoryBtn.hidden = !editMode;
}

function updateModeTabsState() {
  if (!linksNavRef) return;
  linksNavRef.querySelectorAll(".links-nav__tab").forEach((tab) => {
    tab.classList.toggle("links-nav__tab--active", tab.dataset.mode === currentMode);
  });
}

function createLinksNav() {
  const nav = document.createElement("section");
  nav.className = "links-nav";
  nav.innerHTML = `
    <div class="links-nav__modes" role="tablist" aria-label="Режим ссылок">
      <button class="links-nav__tab ${currentMode === "default" ? "links-nav__tab--active" : ""}" data-mode="default" type="button">Обычные</button>
      <button class="links-nav__tab ${currentMode === "work" ? "links-nav__tab--active" : ""}" data-mode="work" type="button">Рабочие</button>
    </div>
    <div class="links-nav__actions">
      <button class="links-nav__edit-btn" id="edit-links-btn" type="button">Редактировать</button>
      <button class="links-nav__add-btn" id="add-category-btn" type="button" hidden>+ Категория</button>
    </div>
  `;

  nav.addEventListener("click", (event) => {
    const modeBtn = event.target.closest(".links-nav__tab");
    if (modeBtn) {
      const nextMode = modeBtn.dataset.mode;
      if (!nextMode || nextMode === currentMode) return;
      currentMode = nextMode;
      editingItem = null;
      updateModeTabsState();
      renderCategories();
      localStorage.setItem("linkMode", currentMode);
      return;
    }

    const editBtn = event.target.closest("#edit-links-btn");
    if (editBtn) {
      toggleEditMode();
      return;
    }

    const addCategoryBtn = event.target.closest("#add-category-btn");
    if (addCategoryBtn) {
      const modeKey = getModeKey(currentMode);
      linksState[modeKey].push({ title: "Новая категория", items: [] });
      saveLinksAndSync();
      renderCategories();
    }
  });

  return nav;
}

function createHeader() {
  const header = document.createElement("header");
  header.className = "header";
  header.innerHTML = `
    <div class="header__title">Space Tab</div>
    <div class="header__actions">
      <div class="speed-test">
        <button class="speed-test__btn" title="Тест скорости">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </button>
        <div class="speed-test__results" hidden>
          <span class="speed-test__country" title="Страна подключения">--</span>
          <span class="speed-test__divider">/</span>
          <span class="speed-test__ping">-- <small>ms</small></span>
          <span class="speed-test__divider">/</span>
          <span class="speed-test__download">-- <small>Mb/s</small></span>
        </div>
      </div>
      <button class="header__currency-toggle" id="currency-menu-toggle" type="button" title="Конвертер валют" aria-label="Конвертер валют">₽/$</button>
      <button class="header__blackout-btn" id="blackout-toggle-btn" type="button" title="Чёрный экран на весь монитор" aria-label="Чёрный экран"></button>
      <button class="header__menu-toggle" id="drive-menu-toggle" title="Открыть меню синхронизации" aria-label="Открыть меню">
        <span></span><span></span><span></span>
      </button>
      <div class="currency-menu__overlay" id="currency-menu-overlay"></div>
      <aside class="currency-menu" id="currency-menu" aria-label="Конвертер валют">
        <div class="currency-menu__head">Конвертер валют</div>
        <div class="currency-menu__body">
          <label class="currency-menu__label">
            Сумма
            <input class="currency-menu__input" id="currency-amount" type="number" min="0" step="0.01" value="1000">
          </label>
          <div class="currency-menu__row">
            <div class="currency-select" data-select-kind="from">
              <button class="currency-select__trigger" id="currency-from-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span class="currency-select__value" id="currency-from-value">USD</span>
                <span class="currency-select__caret">▾</span>
              </button>
              <div class="currency-select__panel" id="currency-from-panel" hidden>
                <div class="currency-select__quick" id="currency-from-quick"></div>
                <div class="currency-select__search-wrap">
                  <input class="currency-select__search" id="currency-from-search" type="text" placeholder="Найти" autocomplete="off">
                </div>
                <div class="currency-select__list" id="currency-from-list" role="listbox" aria-label="Валюта источника"></div>
              </div>
            </div>
            <button class="currency-menu__swap" id="currency-swap" type="button" title="Поменять местами">⇄</button>
            <div class="currency-select" data-select-kind="to">
              <button class="currency-select__trigger" id="currency-to-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span class="currency-select__value" id="currency-to-value">RUB</span>
                <span class="currency-select__caret">▾</span>
              </button>
              <div class="currency-select__panel" id="currency-to-panel" hidden>
                <div class="currency-select__quick" id="currency-to-quick"></div>
                <div class="currency-select__search-wrap">
                  <input class="currency-select__search" id="currency-to-search" type="text" placeholder="Найти" autocomplete="off">
                </div>
                <div class="currency-select__list" id="currency-to-list" role="listbox" aria-label="Валюта назначения"></div>
              </div>
            </div>
          </div>
          <div class="currency-menu__result" id="currency-result">—</div>
          <div class="currency-menu__meta" id="currency-meta">Загрузка курсов...</div>
        </div>
      </aside>
      <div class="drive-menu__overlay" id="drive-menu-overlay"></div>
      <aside class="drive-menu" id="drive-menu" aria-label="Синхронизация Google Drive">
        <div class="drive-menu__head">Google Drive</div>
        <div class="drive-menu__actions">
          <button class="header__google-drive" id="google-drive-btn" title="Войти в Google и сохранить">Войти</button>
          <button class="header__google-drive-load" id="google-drive-load-btn" title="Загрузить из Google Drive" hidden>Загрузить</button>
          <button class="header__google-drive-logout" id="google-drive-logout-btn" title="Выйти из Google" hidden>Выйти</button>
        </div>
      </aside>
    </div>
  `;

  const speedBtn = header.querySelector(".speed-test__btn");
  speedBtn.addEventListener("click", () => handleSpeedTest(header));

  header.querySelector("#blackout-toggle-btn")?.addEventListener("click", () => {
    enableBlackout();
  });

  const menu = header.querySelector("#drive-menu");
  const menuToggle = header.querySelector("#drive-menu-toggle");
  const menuOverlay = header.querySelector("#drive-menu-overlay");

  const setMenuOpen = (open) => {
    menu?.classList.toggle("drive-menu--open", open);
    menuOverlay?.classList.toggle("drive-menu__overlay--open", open);
    menuToggle?.classList.toggle("header__menu-toggle--open", open);
  };

  const currencyConverter = initCurrencyConverter(header, {
    onOpen: () => setMenuOpen(false)
  });

  menuToggle?.addEventListener("click", () => {
    currencyConverter.closeMenu();
    setMenuOpen(!menu?.classList.contains("drive-menu--open"));
  });
  menuOverlay?.addEventListener("click", () => setMenuOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
      currencyConverter.closeMenu();
    }
  });

  header
    .querySelector("#google-drive-btn")
    ?.addEventListener("click", async () => {
      if (!driveConnected) {
        await loginGoogle({ interactive: true });
        setMenuOpen(false);
        return;
      }

      const confirmed = await confirmSaveModal();
      if (!confirmed) return;
      syncToDrive({ interactive: false, notify: true });
      setMenuOpen(false);
    });
  header
    .querySelector("#google-drive-load-btn")
    ?.addEventListener("click", () => {
      loadFromDrive({ interactive: !driveConnected });
      setMenuOpen(false);
    });
  header.querySelector("#google-drive-logout-btn")?.addEventListener("click", () => {
    disconnectGoogleDrive();
    setMenuOpen(false);
  });

  return header;
}

function getBlackoutOverlay() {
  return document.getElementById("blackout-screen");
}

function disableBlackout() {
  const overlay = getBlackoutOverlay();
  if (!overlay) return;
  overlay.classList.remove("blackout-screen--active");
  blackoutActive = false;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function enableBlackout() {
  const overlay = getBlackoutOverlay();
  if (!overlay || blackoutActive) return;

  blackoutActive = true;
  overlay.classList.add("blackout-screen--active");

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

function initBlackoutOverlay() {
  const existing = getBlackoutOverlay();
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.id = "blackout-screen";
  overlay.className = "blackout-screen";
  document.body.appendChild(overlay);

  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    disableBlackout();
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && blackoutActive) {
      disableBlackout();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && blackoutActive) {
      disableBlackout();
    }
  });
}

function handleSpeedTest(header) {
  const resultsEl = header.querySelector(".speed-test__results");

  if (!resultsEl.hidden && !speedTestRunning) {
    hideSpeedTestResults(resultsEl);
    return;
  }

  if (speedTestRunning) return;
  speedTestRunning = true;

  const btn = header.querySelector(".speed-test__btn");
  const countryEl = header.querySelector(".speed-test__country");
  const pingEl = header.querySelector(".speed-test__ping");
  const downloadEl = header.querySelector(".speed-test__download");

  btn.classList.add("speed-test__btn--running");
  hideSpeedTestResults(resultsEl);
  countryEl.textContent = "--";
  countryEl.title = "Страна подключения";
  pingEl.innerHTML = '-- <small>ms</small>';
  downloadEl.innerHTML = '-- <small>Mb/s</small>';

  runSpeedTest((progress) => {
    if (progress.stage === "country") {
      if (progress.status === "done") {
        countryEl.textContent = progress.countryCode || "--";
        countryEl.title = progress.countryCode ? `Страна подключения: ${progress.countryCode}` : "Страна подключения";
      } else if (progress.status === "error") {
        countryEl.textContent = "--";
        countryEl.title = "Страна подключения";
      }
    }
    if (progress.stage === "ping") {
      if (progress.status === "done") {
        pingEl.innerHTML = `${progress.ping} <small>ms</small>`;
      } else if (progress.status === "error") {
        pingEl.innerHTML = '<span class="speed-test__error">err</span>';
      }
    }
    if (progress.stage === "download") {
      if (progress.status === "done") {
        downloadEl.innerHTML = `${progress.speed.toFixed(1)} <small>Mb/s</small>`;
      } else if (progress.status === "error") {
        downloadEl.innerHTML = '<span class="speed-test__error">err</span>';
      }
    }
  }).finally(() => {
    speedTestRunning = false;
    btn.classList.remove("speed-test__btn--running");
    resultsEl.hidden = false;
    clearTimeout(speedTestResultsTimer);
    speedTestResultsTimer = setTimeout(() => {
      hideSpeedTestResults(resultsEl);
    }, 6000);
  });
}

function hideSpeedTestResults(resultsEl) {
  if (speedTestResultsTimer) {
    clearTimeout(speedTestResultsTimer);
    speedTestResultsTimer = null;
  }
  resultsEl.hidden = true;
}

function renderItemEditorDock() {
  const existing = document.getElementById("item-editor-dock");
  if (!editMode || !editingItem) {
    closeItemIconPicker();
    if (existing) existing.remove();
    return;
  }

  const categories = getCurrentCategories();
  const item = categories[editingItem.categoryIndex]?.items?.[editingItem.itemIndex];
  if (!item) {
    editingItem = null;
    closeItemIconPicker();
    if (existing) existing.remove();
    return;
  }

  const dock = existing || document.createElement("div");
  dock.id = "item-editor-dock";
  dock.className = "item-editor-dock";
  const span = getItemSpan(item);
  const activeSize = `${span.colSpan}x${span.rowSpan}`;
  dock.innerHTML = `
    <div class="item-editor-dock__title">Редактирование ячейки</div>
    <div class="item-editor-dock__preview">
      <button class="item-editor-dock__preview-icon" data-action="toggle-icon-picker" title="Выбрать локальную иконку" type="button">
        <img id="item-editor-preview-img" src="${resolveEditorIconPreview(item.img, item.link)}" alt="preview" loading="lazy" />
      </button>
      <div class="item-editor-dock__preview-text" id="item-editor-preview-text">${item.name || "Новая ссылка"}</div>
      <div class="item-editor-dock__preview-color">
        <label class="item-editor__color-label item-editor__color-label--inline" title="Цвет обводки при наведении">
          <input class="item-editor__color-input" data-field="borderColor" data-custom-value="${normalizeItemBorderColor(item.borderColor) ? "true" : "false"}" type="color" value="${normalizeItemBorderColor(item.borderColor) || "#83C6F9"}">
        </label>
        <button class="item-editor__btn item-editor__btn--ghost item-editor__btn--icon" type="button" data-action="reset-border-color" title="Сбросить цвет обводки" aria-label="Сбросить цвет обводки">↺</button>
      </div>
    </div>
    <div class="item-editor-dock__grid">
      <input class="item-editor__input" data-field="name" placeholder="Название" value="${item.name || ""}">
      <input class="item-editor__input" data-field="link" placeholder="Ссылка" value="${item.link || ""}">
      <input class="item-editor__input" data-field="img" placeholder="Иконка (URL/путь)" value="${item.img || ""}">
      <div class="item-editor__resize">
        <button class="item-editor__size-btn ${activeSize === "1x1" ? "item-editor__size-btn--active" : ""}" data-action="set-size" data-size="1x1" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">1x1</button>
        <button class="item-editor__size-btn ${activeSize === "2x1" ? "item-editor__size-btn--active" : ""}" data-action="set-size" data-size="2x1" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">2x1</button>
        <button class="item-editor__size-btn ${activeSize === "1x2" ? "item-editor__size-btn--active" : ""}" data-action="set-size" data-size="1x2" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">1x2</button>
        <button class="item-editor__size-btn ${activeSize === "2x2" ? "item-editor__size-btn--active" : ""}" data-action="set-size" data-size="2x2" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">2x2</button>
      </div>
    </div>
    <div class="item-editor__actions">
      <button class="item-editor__btn" data-action="save-item" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">Сохранить</button>
      <button class="item-editor__btn" data-action="cancel-edit-item">Отмена</button>
      <button class="item-editor__btn item-editor__btn--danger" data-action="delete-item" data-category-index="${editingItem.categoryIndex}" data-item-index="${editingItem.itemIndex}">Удалить</button>
    </div>
  `;

  if (!existing) document.body.appendChild(dock);

  if (iconPickerOpen) {
    const popover = ensureItemIconPickerPopover();
    positionItemIconPickerPopover(dock, popover);
    renderItemIconPicker({ loading: true });
    listLocalItemIcons().then((icons) => {
      const currentDock = document.getElementById("item-editor-dock");
      const selected = currentDock?.querySelector('[data-field="img"]')?.value || "";
      if (!currentDock || !iconPickerOpen) return;
      renderItemIconPicker({ loading: false, icons, selected });
      positionItemIconPickerPopover(currentDock, popover);
    });
  }

  refreshEditorDockPreview();
}

function refreshEditorDockPreview() {
  const dock = document.getElementById("item-editor-dock");
  if (!dock) return;

  const name = dock.querySelector('[data-field="name"]')?.value?.trim() || "Новая ссылка";
  const link = dock.querySelector('[data-field="link"]')?.value?.trim() || "https://example.com";
  const img = dock.querySelector('[data-field="img"]')?.value?.trim() || "";
  const borderInput = dock.querySelector('[data-field="borderColor"]');
  const borderColor = borderInput?.dataset.customValue === "true"
    ? normalizeItemBorderColor(borderInput.value)
    : "";
  const previewImg = dock.querySelector("#item-editor-preview-img");
  const previewText = dock.querySelector("#item-editor-preview-text");
  const previewWrap = dock.querySelector(".item-editor-dock__preview");

  if (previewImg) {
    previewImg.src = resolveEditorIconPreview(img, link);
    previewImg.alt = name;
  }
  if (previewText) previewText.textContent = name;
  if (previewWrap) {
    previewWrap.style.setProperty("--item-border-color", borderColor || "rgba(180, 222, 255, 0.16)");
    previewWrap.classList.toggle("item-editor-dock__preview--custom-border", Boolean(borderColor));
  }

  if (iconPickerOpen) {
    renderItemIconPicker({
      loading: localItemIconsLoading,
      icons: localItemIconsCache || [],
      selected: img
    });
    const popover = document.getElementById("item-icon-picker-popover");
    if (popover && !popover.hidden) {
      positionItemIconPickerPopover(dock, popover);
    }
  }
}

function renderCategories() {
  app.innerHTML = "";
  const categories = getCurrentCategories();

  categories.forEach((category, catIndex) => {
    const section = document.createElement("section");
    section.className = `category${editMode ? " category--edit" : ""}`;
    section.dataset.categoryIndex = String(catIndex);

    const titleRow = document.createElement("div");
    titleRow.className = "category__header";

    if (editMode) {
      const titleInput = document.createElement("input");
      titleInput.className = "category__title-input";
      titleInput.value = category.title;
      titleInput.dataset.action = "edit-category-title";
      titleInput.dataset.categoryIndex = String(catIndex);
      titleRow.appendChild(titleInput);

      const controls = document.createElement("div");
      controls.className = "category__controls";
      controls.innerHTML = `
        <button class="category__control-btn" data-action="add-item" data-category-index="${catIndex}" title="Добавить ячейку">＋</button>
        <button class="category__control-btn category__control-btn--danger" data-action="delete-category" data-category-index="${catIndex}" title="Удалить категорию">×</button>
      `;
      titleRow.appendChild(controls);
    } else {
      const title = document.createElement("h2");
      title.className = "category__title";
      title.textContent = category.title;
      titleRow.appendChild(title);
    }

    const grid = document.createElement("div");
    grid.className = "category__grid";
    grid.dataset.categoryIndex = String(catIndex);

    const layout = buildCategoryLayout(category.items);

    layout.placements.forEach((placement) => {
      const itemIndex = placement.itemIndex;
      const item = category.items[itemIndex];
      const isEditing =
        editMode &&
        editingItem &&
        editingItem.categoryIndex === catIndex &&
        editingItem.itemIndex === itemIndex;

      const wrap = document.createElement("div");
      wrap.className = `item-wrap${isEditing ? " item-wrap--editing" : ""}`;
      wrap.dataset.categoryIndex = String(catIndex);
      wrap.dataset.itemIndex = String(itemIndex);
      wrap.style.gridColumn = `${placement.col} / span ${placement.colSpan}`;
      wrap.style.gridRow = `${placement.row} / span ${placement.rowSpan}`;

      const link = document.createElement("a");
      link.href = normalizeLink(item.link);
      link.className = "item item-link";
      link.dataset.name = item.name;
      link.dataset.categoryIndex = String(catIndex);
      link.dataset.itemIndex = String(itemIndex);
      link.dataset.size = `${placement.colSpan}x${placement.rowSpan}`;
      link.target = "_self";
      link.innerHTML = `<img src="${getItemIconSrc(item)}" alt="${item.name}" loading="eager" decoding="sync" fetchpriority="high" />`;
      const borderColor = normalizeItemBorderColor(item.borderColor);
      if (borderColor) {
        link.style.setProperty("--item-border-color", borderColor);
        link.style.setProperty("--item-hover-shadow", `${borderColor}33`);
      }

      wrap.appendChild(link);

      if (editMode) {
        const dragBtn = document.createElement("button");
        dragBtn.className = "item__drag-handle";
        dragBtn.dataset.dragType = "item";
        dragBtn.dataset.categoryIndex = String(catIndex);
        dragBtn.dataset.itemIndex = String(itemIndex);
        dragBtn.draggable = true;
        dragBtn.type = "button";
        dragBtn.title = "Зажмите и перетащите";
        dragBtn.textContent = "⋮⋮";
        wrap.appendChild(dragBtn);

        const editBtn = document.createElement("button");
        editBtn.className = "item__edit-btn";
        editBtn.dataset.action = "edit-item";
        editBtn.dataset.categoryIndex = String(catIndex);
        editBtn.dataset.itemIndex = String(itemIndex);
        editBtn.title = "Редактировать ячейку";
        editBtn.textContent = "✎";
        wrap.appendChild(editBtn);
      }

      grid.appendChild(wrap);
    });

    if (editMode) {
      layout.emptyCells.forEach((cell) => {
        const empty = document.createElement("div");
        empty.className = "item-slot item-slot--empty";
        empty.dataset.action = "place-item-here";
        empty.dataset.categoryIndex = String(catIndex);
        empty.dataset.slotIndex = String(cell.cellIndex);
        empty.style.gridColumn = `${cell.col}`;
        empty.style.gridRow = `${cell.row}`;
        if (editingItem) empty.classList.add("item-slot--available");
        grid.appendChild(empty);
      });
    }

    section.appendChild(titleRow);
    section.appendChild(grid);
    app.appendChild(section);
  });

  renderItemEditorDock();
}

function saveEditedItem(catIndex, itemIndex, editorEl) {
  const categories = getCurrentCategories();
  const category = categories[catIndex];
  const item = category?.items?.[itemIndex];
  if (!item || !editorEl) return;

  const name = editorEl.querySelector('[data-field="name"]')?.value?.trim();
  const link = editorEl.querySelector('[data-field="link"]')?.value?.trim();
  const img = normalizeLocalIconValue(editorEl.querySelector('[data-field="img"]')?.value?.trim());
  const borderInput = editorEl.querySelector('[data-field="borderColor"]');
  const borderColor = borderInput?.dataset.customValue === "true"
    ? normalizeItemBorderColor(borderInput.value)
    : "";
  const selectedSize = editorEl.querySelector('.item-editor__size-btn--active')?.dataset.size || "1x1";
  const [colSpanRaw, rowSpanRaw] = selectedSize.split("x");
  const colSpan = Math.min(2, Math.max(1, Number(colSpanRaw || 1)));
  const rowSpan = Math.min(2, Math.max(1, Number(rowSpanRaw || 1)));

  item.name = name || "Новая ссылка";
  item.link = link || "https://";
  item.img = img || "";
  item.borderColor = borderColor;
  item.colSpan = colSpan;
  item.rowSpan = rowSpan;
  item.wide = colSpan === 2 && rowSpan === 1;

  linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
  saveLinksAndSync();
  editingItem = null;
  closeItemIconPicker();
  renderCategories();
}

function applyItemSizeImmediately(catIndex, itemIndex, sizeValue, editorEl) {
  const categories = getCurrentCategories();
  const category = categories[catIndex];
  const item = category?.items?.[itemIndex];
  if (!item) return;

  const [colSpanRaw, rowSpanRaw] = String(sizeValue || "1x1").split("x");
  const colSpan = Math.min(2, Math.max(1, Number(colSpanRaw || 1)));
  const rowSpan = Math.min(2, Math.max(1, Number(rowSpanRaw || 1)));

  if (editorEl) {
    const name = editorEl.querySelector('[data-field="name"]')?.value?.trim();
    const link = editorEl.querySelector('[data-field="link"]')?.value?.trim();
    const img = normalizeLocalIconValue(editorEl.querySelector('[data-field="img"]')?.value?.trim());
    const borderInput = editorEl.querySelector('[data-field="borderColor"]');
    const borderColor = borderInput?.dataset.customValue === "true"
      ? normalizeItemBorderColor(borderInput.value)
      : "";
    item.name = name || item.name || "Новая ссылка";
    item.link = link || item.link || "https://";
    item.img = img || "";
    item.borderColor = borderColor;
  }

  item.colSpan = colSpan;
  item.rowSpan = rowSpan;
  item.wide = colSpan === 2 && rowSpan === 1;

  linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
  saveLinksAndSync();
  editingItem = { categoryIndex: catIndex, itemIndex };
  renderCategories();
}

function moveItemToSlot(categoryIndex, itemIndex, slotIndex) {
  const categories = getCurrentCategories();
  const category = categories[categoryIndex];
  if (!category || !category.items?.[itemIndex]) return;

  const item = category.items[itemIndex];
  item.gridIndex = Math.max(0, Math.min(15, Number(slotIndex) || 0));

  linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
  saveLinksAndSync();
  editingItem = { categoryIndex, itemIndex };
  renderCategories();
}

function moveItemBetweenCategories(sourceCategoryIndex, sourceItemIndex, targetCategoryIndex, targetCellIndex) {
  const categories = getCurrentCategories();
  const sourceCategory = categories[sourceCategoryIndex];
  const targetCategory = categories[targetCategoryIndex];
  if (!sourceCategory || !targetCategory) return;
  if (!sourceCategory.items?.[sourceItemIndex]) return;

  const [movedItem] = sourceCategory.items.splice(sourceItemIndex, 1);
  movedItem.gridIndex = Math.max(0, Math.min(15, Number(targetCellIndex) || 0));

  let insertIndex = targetCategory.items.length;
  if (sourceCategoryIndex === targetCategoryIndex) {
    insertIndex = Math.min(sourceItemIndex, targetCategory.items.length);
  }
  targetCategory.items.splice(insertIndex, 0, movedItem);
  linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
  saveLinksAndSync();
  editingItem = { categoryIndex: targetCategoryIndex, itemIndex: insertIndex };
  renderCategories();
}

function clearDropHighlights() {
  app.querySelectorAll(".item-wrap--drop-target").forEach((el) => el.classList.remove("item-wrap--drop-target"));
  app.querySelectorAll(".item-slot--drop-target").forEach((el) => el.classList.remove("item-slot--drop-target"));
}

function clearDragState() {
  dragState.active = false;
  dragState.sourceCategoryIndex = null;
  dragState.sourceItemIndex = null;
  clearDropHighlights();
}

function attachAppEvents() {
  app.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    const linkEl = event.target.closest(".item-link");

    if (editMode && linkEl) {
      event.preventDefault();
    }

    if (!actionEl || !editMode) return;

    const action = actionEl.dataset.action;
    const categoryIndexRaw = actionEl.dataset.categoryIndex;
    const itemIndexRaw = actionEl.dataset.itemIndex;
    const categoryIndex = categoryIndexRaw !== undefined ? Number(categoryIndexRaw) : editingItem?.categoryIndex;
    const itemIndex = itemIndexRaw !== undefined ? Number(itemIndexRaw) : editingItem?.itemIndex;
    const categories = getCurrentCategories();

    if (action === "add-item") {
      const occupied = new Set(buildCategoryLayout(categories[categoryIndex].items).placements.map((p) => p.cellIndex));
      const firstFree = Array.from({ length: 16 }, (_, i) => i).find((i) => !occupied.has(i)) ?? 0;
      categories[categoryIndex].items.push({
        name: "Новая ссылка",
        link: "https://",
        img: "",
        borderColor: "",
        gridIndex: firstFree,
        colSpan: 1,
        rowSpan: 1,
        wide: false
      });
      saveLinksAndSync();
      editingItem = { categoryIndex, itemIndex: categories[categoryIndex].items.length - 1 };
      renderCategories();
      return;
    }

    if (action === "edit-item") {
      editingItem = { categoryIndex, itemIndex };
      renderCategories();
      return;
    }

    if (action === "save-item") {
      return;
    }

    if (action === "delete-category") {
      categories.splice(categoryIndex, 1);
      linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
      saveLinksAndSync();
      editingItem = null;
      renderCategories();
      return;
    }

    if (action === "place-item-here") {
      if (!editingItem) return;
      const slotIndex = Number(actionEl.dataset.slotIndex || 0);
      if (editingItem.categoryIndex !== categoryIndex) return;
      moveItemToSlot(categoryIndex, editingItem.itemIndex, slotIndex);
      return;
    }

    if (action === "save-item" || action === "cancel-edit-item" || action === "set-size") {
      return;
    }
  });

  app.addEventListener("dragstart", (event) => {
    if (!editMode) return;
    const dragHandle = event.target.closest('[data-drag-type="item"]');
    if (!dragHandle) return;

    dragState.active = true;
    dragState.sourceCategoryIndex = Number(dragHandle.dataset.categoryIndex);
    dragState.sourceItemIndex = Number(dragHandle.dataset.itemIndex);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "item-move");
    }
  });

  app.addEventListener("dragover", (event) => {
    if (!editMode || !dragState.active) return;

    const itemTarget = event.target.closest(".item-wrap");
    const slotTarget = event.target.closest(".item-slot--empty");
    if (!itemTarget && !slotTarget) return;

    event.preventDefault();
    clearDropHighlights();

    if (itemTarget) {
      itemTarget.classList.add("item-wrap--drop-target");
    } else if (slotTarget) {
      slotTarget.classList.add("item-slot--drop-target");
    }
  });

  app.addEventListener("drop", (event) => {
    if (!editMode || !dragState.active) return;

    const itemTarget = event.target.closest(".item-wrap");
    const slotTarget = event.target.closest(".item-slot--empty");
    if (!itemTarget && !slotTarget) return;

    event.preventDefault();

    if (itemTarget) {
      const targetCategoryIndex = Number(itemTarget.dataset.categoryIndex);
      const targetItemIndex = Number(itemTarget.dataset.itemIndex);
      const targetLayout = buildCategoryLayout(categories[targetCategoryIndex]?.items || []);
      const targetPlacement = targetLayout.placements.find((p) => p.itemIndex === targetItemIndex);
      const targetCellIndex = targetPlacement ? targetPlacement.cellIndex : targetItemIndex;
      moveItemBetweenCategories(
        dragState.sourceCategoryIndex,
        dragState.sourceItemIndex,
        targetCategoryIndex,
        targetCellIndex
      );
      clearDragState();
      return;
    }

    if (slotTarget) {
      const targetCategoryIndex = Number(slotTarget.dataset.categoryIndex);
      const slotIndex = Number(slotTarget.dataset.slotIndex || 0);
      moveItemBetweenCategories(
        dragState.sourceCategoryIndex,
        dragState.sourceItemIndex,
        targetCategoryIndex,
        slotIndex
      );
      clearDragState();
    }
  });

  app.addEventListener("dragend", () => {
    clearDragState();
  });

  document.addEventListener("click", (event) => {
    if (!editMode) return;
    const dock = document.getElementById("item-editor-dock");
    if (!dock) return;
    const popover = document.getElementById("item-icon-picker-popover");

    const actionEl = event.target.closest("[data-action]");
    const inDock = actionEl && dock.contains(actionEl);
    const inPopover = actionEl && popover && popover.contains(actionEl);

    if (!inDock && !inPopover) {
      const clickedInsideDock = dock.contains(event.target);
      const clickedInsidePopover = popover ? popover.contains(event.target) : false;
      if (!clickedInsideDock && !clickedInsidePopover) {
        closeItemIconPicker();
      }
      return;
    }

    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const categoryIndex = Number(actionEl.dataset.categoryIndex);
    const itemIndex = actionEl.dataset.itemIndex !== undefined ? Number(actionEl.dataset.itemIndex) : null;

    if (action === "toggle-icon-picker") {
      toggleItemIconPicker();
      return;
    }

    if (action === "choose-local-icon") {
      const chosen = normalizeLocalIconValue(actionEl.dataset.iconValue);
      const imgInput = dock.querySelector('[data-field="img"]');
      if (imgInput) {
        imgInput.value = chosen;
        refreshEditorDockPreview();
      }
      closeItemIconPicker();
      return;
    }

    if (action === "reset-border-color") {
      const borderInput = dock.querySelector('[data-field="borderColor"]');
      if (borderInput) {
        borderInput.value = "#83C6F9";
        borderInput.dataset.customValue = "false";
        refreshEditorDockPreview();
      }
      return;
    }

    if (action === "save-item") {
      saveEditedItem(categoryIndex, itemIndex, dock);
      return;
    }

    if (action === "cancel-edit-item") {
      editingItem = null;
      closeItemIconPicker();
      renderCategories();
      return;
    }

    if (action === "delete-item") {
      const categories = getCurrentCategories();
      categories[categoryIndex].items.splice(itemIndex, 1);
      linksState[getModeKey(currentMode)] = sanitizeCategories(categories);
      saveLinksAndSync();
      editingItem = null;
      closeItemIconPicker();
      renderCategories();
      return;
    }

    if (action === "set-size") {
      applyItemSizeImmediately(categoryIndex, itemIndex, actionEl.dataset.size, dock);
    }
  });

  document.addEventListener("input", (event) => {
    const dock = document.getElementById("item-editor-dock");
    if (!dock) return;
    if (!dock.contains(event.target)) return;
    if (!event.target.closest("[data-field]")) return;
    if (event.target.matches('[data-field="borderColor"]')) {
      event.target.dataset.customValue = "true";
    }
    refreshEditorDockPreview();
  });

  document.addEventListener("focusin", (event) => {
    const dock = document.getElementById("item-editor-dock");
    if (!dock) return;
    if (!dock.contains(event.target)) return;
    if (event.target.closest('[data-field="name"], [data-field="link"], [data-field="img"]')) {
      closeItemIconPicker();
    }
  });

  window.addEventListener("resize", () => {
    if (!iconPickerOpen) return;
    const dock = document.getElementById("item-editor-dock");
    const popover = document.getElementById("item-icon-picker-popover");
    if (!dock || !popover || popover.hidden) return;
    positionItemIconPickerPopover(dock, popover);
  });

  window.addEventListener("scroll", () => {
    if (!iconPickerOpen) return;
    const dock = document.getElementById("item-editor-dock");
    const popover = document.getElementById("item-icon-picker-popover");
    if (!dock || !popover || popover.hidden) return;
    positionItemIconPickerPopover(dock, popover);
  }, true);

  app.addEventListener("input", (event) => {
    if (!editMode) return;
    const titleInput = event.target.closest('[data-action="edit-category-title"]');
    if (!titleInput) return;

    const categoryIndex = Number(titleInput.dataset.categoryIndex);
    const categories = getCurrentCategories();
    if (!categories[categoryIndex]) return;
    categories[categoryIndex].title = titleInput.value;
    saveLinksAndSync();
  });

}

async function init() {
  const savedMode = localStorage.getItem("linkMode");
  if (savedMode) currentMode = savedMode;

  const header = createHeader();
  document.body.insertBefore(header, document.body.firstChild);
  headerRef = header;
  initBlackoutOverlay();

  const requestStatus = createRequestStatusBar();
  header.insertAdjacentElement("afterend", requestStatus);
  requestStatusRef = requestStatus;

  const linksNav = createLinksNav();
  const habitsEl = document.getElementById("habits-tracker");
  const widgetsPanelEl = document.getElementById("widgets-panel");
  if (widgetsPanelEl?.parentNode) {
    widgetsPanelEl.parentNode.insertBefore(linksNav, widgetsPanelEl.nextSibling);
  } else if (habitsEl?.parentNode) {
    habitsEl.parentNode.insertBefore(linksNav, habitsEl.nextSibling);
  }
  linksNavRef = linksNav;
  updateEditControlsState();
  updateModeTabsState();

  initDriveButtonState();

  attachAppEvents();
  await prewarmCurrentModeIcons();
  renderCategories();
  initHabits();

  window.addEventListener("space-tab:habits-updated", () => {
    scheduleDriveSync();
  });

  window.addEventListener("space-tab:notes-updated", () => {
    scheduleDriveSync();
  });
}

init();

export { toggleHabits };
