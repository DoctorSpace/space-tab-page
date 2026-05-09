import { CATEGORIES, WORK_CATEGORIES } from "./items.js";

export const LINKS_STORAGE_KEY = "space_tab_links_data_v1";

export function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

export function loadLinksState() {
  const defaults = {
    default: cloneData(CATEGORIES),
    work: cloneData(WORK_CATEGORIES)
  };

  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;

    const defaultCategories = Array.isArray(parsed.default) ? parsed.default : defaults.default;
    const workCategories = Array.isArray(parsed.work) ? parsed.work : defaults.work;

    return {
      default: defaultCategories,
      work: workCategories
    };
  } catch {
    return defaults;
  }
}

export function saveLinksState(state) {
  localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(state));
}

export function getModeKey(mode) {
  return mode === "work" ? "work" : "default";
}

export function getCategoriesByMode(state, mode) {
  return state[getModeKey(mode)] || [];
}

export function fallbackFavicon(link) {
  try {
    const normalized = normalizeLink(link);
    const url = new URL(normalized === "#" ? "https://example.com" : normalized);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return "https://www.google.com/s2/favicons?domain=example.com&sz=64";
  }
}

export function normalizeLink(link) {
  const trimmed = (link || "").trim();
  if (!trimmed) return "#";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function sanitizeCategories(categories) {
  if (!Array.isArray(categories)) return [];

  return categories
    .map((category) => ({
      title: (category.title || "").trim() || "Без названия",
      items: Array.isArray(category.items)
        ? category.items
            .map((item) => ({
              name: (item.name || "").trim() || "Новая ссылка",
              link: (item.link || "").trim(),
              img: (item.img || "").trim(),
              borderColor: /^#[0-9a-fA-F]{6}$/.test(String(item.borderColor || "").trim())
                ? String(item.borderColor).trim()
                : "",
              gridIndex: Number.isFinite(Number(item.gridIndex))
                ? Math.max(0, Math.min(15, Number(item.gridIndex)))
                : null,
              colSpan: Math.min(2, Math.max(1, Number(item.colSpan || (item.wide ? 2 : 1)))),
              rowSpan: Math.min(2, Math.max(1, Number(item.rowSpan || 1))),
              wide: Math.min(2, Math.max(1, Number(item.colSpan || (item.wide ? 2 : 1)))) === 2 &&
                Math.min(2, Math.max(1, Number(item.rowSpan || 1))) === 1
            }))
            .filter((item) => item.link)
        : []
    }))
    .filter((category) => category.items.length > 0 || category.title);
}

export function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
