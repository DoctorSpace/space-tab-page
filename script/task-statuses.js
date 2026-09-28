import {
  DONE_STATUS_ID,
  TASK_STATUS_STORAGE_KEY,
  loadTaskBoard,
  makeSprint,
  makeStatus,
  makeTask,
  makeTaskLink,
  makeTaskResponsible,
  saveTaskBoard
} from "./task-status-data.js";
import {
  initTaskReminderAlerts,
  isTaskReminderTestPending,
  publishTaskReminder,
  scheduleTaskReminderTest
} from "./alerts.js";

const ICONS = [
  { id: "play", label: "В работе" },
  { id: "clock", label: "Ожидание" },
  { id: "flask", label: "Тестирование" },
  { id: "eye", label: "Ревью" },
  { id: "pause", label: "Пауза" },
  { id: "block", label: "Заблокировано" },
  { id: "check", label: "Готово" },
  { id: "alert", label: "Внимание" },
  { id: "rocket", label: "Запуск" },
  { id: "bug", label: "Ошибка" },
  { id: "target", label: "Цель" },
  { id: "branch", label: "Разработка" },
  { id: "user", label: "Ответственный" },
  { id: "star", label: "Приоритет" }
];
const SUMMARY_STATUS_ICONS = {
  play: "▶️",
  clock: "⏳",
  flask: "🧪",
  eye: "👀",
  pause: "⏸️",
  block: "⛔",
  check: "✅",
  alert: "⚠️",
  rocket: "🚀",
  bug: "🐞",
  target: "🎯",
  branch: "⑂",
  user: "👤",
  star: "⭐"
};
const URGENT_FILTER_KEY = "space_tab_task_urgent_filter_v1";
const COLLAPSED_STATUSES_KEY = "space_tab_task_collapsed_statuses_v1";
const COLLAPSED_SPRINTS_KEY = "space_tab_task_collapsed_sprints_v1";
const UNASSIGNED_SPRINT_ID = "without-sprint";
const REMINDER_DAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" }
];
const TASK_MARKERS = [
  "document",
  "⭐",
  "🔔",
  "⚠️",
  "❌",
  "📌",
  "🐞",
  "🚧",
  "✅",
  "⏳",
  "🔥",
  "💡",
  "🔒",
  "❓",
  "📝",
  "🎯",
  "🧪",
  "👀",
  "⛔",
  "🚀",
  "🛠️",
  "🧩",
  "💬"
];

let board = loadTaskBoard();
let selectedStatusId = "";
let searchQuery = "";
let showUrgentOnly = localStorage.getItem(URGENT_FILTER_KEY) === "1";
let editingStatuses = false;
let taskDraft = null;
let saveTimer = null;
let saveLabelTimer = null;
let draggedTaskId = "";
let draggedStatusId = "";
let driveRestoreRunning = false;
let dueRefreshTimer = null;
let reminderTimer = null;
let markerPickerOpen = false;
let activeMarkdownLink = null;
let markdownLinkDialogState = null;
let markdownLinkPreviewTimer = null;
let sprintEditor = null;
const collapsedStatuses = loadCollapsedStatuses();
const collapsedSprints = loadCollapsedSprints();
const pendingStatusFields = new Set();
const pendingTaskFields = new Set();
const pendingLinkFields = new Set();
const pendingResponsibleFields = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadCollapsedStatuses() {
  try {
    const statusIds = JSON.parse(localStorage.getItem(COLLAPSED_STATUSES_KEY) || "[]");
    return new Set(Array.isArray(statusIds) ? statusIds.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedStatuses() {
  localStorage.setItem(COLLAPSED_STATUSES_KEY, JSON.stringify([...collapsedStatuses]));
}

function loadCollapsedSprints() {
  try {
    const ids = JSON.parse(localStorage.getItem(COLLAPSED_SPRINTS_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedSprints() {
  localStorage.setItem(COLLAPSED_SPRINTS_KEY, JSON.stringify([...collapsedSprints]));
}

function iconSvg(icon, size = 18) {
  const paths = {
    play: '<path d="M8 5.5v13l10-6.5-10-6.5Z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    flask: '<path d="M9 3h6M10 3v5l-4.8 8.2A3.1 3.1 0 0 0 7.9 21h8.2a3.1 3.1 0 0 0 2.7-4.8L14 8V3M7.7 15h8.6"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    pause: '<path d="M9 7v10M15 7v10"/>',
    block: '<circle cx="12" cy="12" r="8"/><path d="m6.4 6.4 11.2 11.2"/>',
    check: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.4 4.8-5"/>',
    alert: '<path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4.5M12 16.5v.1"/>',
    document: '<path d="M7 3.5h7l4 4V20H7V3.5Z"/><path d="M14 3.5V8h4M10 12h5M10 15h5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/>',
    chevron: '<path d="m7 9.5 5 5 5-5"/>',
    bell: '<path d="M6.5 16.5h11l-1.3-2.1V10a4.2 4.2 0 0 0-8.4 0v4.4l-1.3 2.1ZM10 19h4"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    rocket: '<path d="M14 5c2.5-2.5 5-2 5-2s.5 2.5-2 5l-4 4-3-3 4-4Z"/><path d="m10 9-4 .8L3 13l5 1 2-5ZM13 12l-.8 4L9 19l-1-5 5-2ZM6 18c-1.5.2-2.2.9-2.5 2.5C5.1 20.2 5.8 19.5 6 18Z"/>',
    bug: '<path d="M8 9h8v7a4 4 0 0 1-8 0V9ZM9.5 9V7.5a2.5 2.5 0 0 1 5 0V9M4 12h4M16 12h4M5 17h3M16 17h3M7 7 5 5M17 7l2-2"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    branch: '<circle cx="7" cy="5" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="19" r="2"/><path d="M7 7v10M9 11h3a5 5 0 0 0 5-2"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
    star: '<path d="m12 3 2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9L12 3Z"/>',
    link: '<path d="M10.2 13.8a4 4 0 0 0 5.7.1l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.8 10.2a4 4 0 0 0-5.7-.1l-2.5 2.5a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l.8 13h8.4L17 7M10 11v5M14 11v5"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[icon] || paths.clock}</svg>`;
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "#3ba7ff").replace("#", "");
  const number = Number.parseInt(value, 16);
  if (Number.isNaN(number)) return `rgba(59, 167, 255, ${alpha})`;
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function statusStyle(status) {
  return `--status-color:${status.color};--status-soft:${hexToRgba(status.color, 0.13)};--status-border:${hexToRgba(status.color, 0.38)}`;
}

function taskMarkerStyle(task) {
  const color = task.markerColor || "#75bdf0";
  return `--task-marker-color:${color};--task-marker-soft:${hexToRgba(color, 0.11)};--task-marker-border:${hexToRgba(color, 0.42)}`;
}

function renderTaskMarker(icon, size = 16) {
  return icon === "document" ? iconSvg("document", size) : `<span aria-hidden="true">${escapeHtml(icon)}</span>`;
}

function updateTaskMarkerControls() {
  if (!taskDraft) return;
  const detail = document.getElementById("task-status-detail");
  if (!detail) return;
  const markerStyle = taskMarkerStyle(taskDraft);
  const trigger = detail.querySelector(".task-detail__marker-trigger");
  const popover = detail.querySelector(".task-detail__marker-popover");
  if (trigger) {
    trigger.innerHTML = `${renderTaskMarker(taskDraft.markerIcon, 16)}${iconSvg("chevron", 13)}`;
    trigger.setAttribute("style", markerStyle);
    trigger.setAttribute("aria-expanded", String(markerPickerOpen));
  }
  if (popover) popover.hidden = !markerPickerOpen;
  detail.querySelectorAll(".task-detail__marker-option").forEach((option) => {
    option.classList.toggle("task-detail__marker-option--active", option.dataset.markerIcon === taskDraft.markerIcon);
    option.setAttribute("style", markerStyle);
  });
  const swatch = detail.querySelector(".task-detail__marker-color-swatch");
  if (swatch) swatch.style.background = taskDraft.markerColor;
}

function syncTrackerLink(task) {
  const normalizedCode = String(task?.code || "").trim().toUpperCase();
  const trackerUrl = /^(ONBL|WBF)-[0-9]+$/.test(normalizedCode)
    ? `https://tracker.wb.ru/i/DBOUL/${normalizedCode}`
    : "";
  let trackerLink = task.links.find((link) => link.label.trim().toLocaleLowerCase("ru") === "tracker");
  if (trackerUrl && !trackerLink) {
    trackerLink = makeTaskLink();
    trackerLink.label = "Tracker";
    task.links.push(trackerLink);
  }
  if (trackerLink && trackerUrl) trackerLink.url = trackerUrl;
  else if (trackerLink && /^https:\/\/tracker\.wb\.ru\/(?:issue|i\/DBOUL)\/(ONBL|WBF)-[0-9]+\/?$/i.test(trackerLink.url)) {
    trackerLink.url = "";
  }
  return trackerLink || null;
}

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderMarkdownEditor(value) {
  const source = String(value || "");
  const pattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let html = "";
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source))) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    const url = safeUrl(match[2]);
    html += url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-markdown-link data-link-url="${escapeHtml(url)}" contenteditable="false" aria-label="${escapeHtml(`${match[1]}: ${url}`)}">${escapeHtml(match[1])}</a>`
      : escapeHtml(match[0]);
    lastIndex = pattern.lastIndex;
  }
  return html + escapeHtml(source.slice(lastIndex));
}

function markdownFromEditor(editor) {
  const serialize = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.matches("[data-markdown-link]")) {
      return `[${node.textContent}](${node.dataset.linkUrl})`;
    }
    if (node.tagName === "BR") return "\n";
    const content = [...node.childNodes].map(serialize).join("");
    if (["DIV", "P"].includes(node.tagName) && node.previousSibling) return `\n${content}`;
    return content;
  };
  return [...editor.childNodes].map(serialize).join("").replace(/\n+$/, "").slice(0, 12000);
}

function syncMarkdownEditor(editor) {
  if (!taskDraft) return;
  const field = editor.dataset.markdownField;
  if (!["description", "dailyUpdate"].includes(field)) return;
  taskDraft[field] = markdownFromEditor(editor);
  pendingTaskFields.add(field);
  if (field === "dailyUpdate") {
    taskDraft.dailyUpdateDate = localDateStamp();
    pendingTaskFields.add("dailyUpdateDate");
  }
  scheduleTextSave();
}

function setMarkdownLink(link, text, value) {
  const url = safeUrl(value);
  if (!url) return false;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.markdownLink = "";
  link.dataset.linkUrl = url;
  link.contentEditable = "false";
  link.textContent = text;
  link.title = `Текст: ${text}\nСсылка: ${url}`;
  return true;
}

function placeMarkdownLink(editor, link, savedRange = null) {
  const selection = window.getSelection();
  const range = savedRange?.cloneRange() || (selection?.rangeCount ? selection.getRangeAt(0) : document.createRange());
  const hasEditorRange = editor.contains(range.commonAncestorContainer);
  if (!hasEditorRange) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const addTrailingSpace = range.collapsed;
  range.deleteContents();
  range.insertNode(link);
  range.setStartAfter(link);
  if (addTrailingSpace) {
    const space = document.createTextNode(" ");
    range.insertNode(space);
    range.setStartAfter(space);
  }
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus();
  syncMarkdownEditor(editor);
}

function closeMarkdownLinkPreview() {
  clearTimeout(markdownLinkPreviewTimer);
  document.getElementById("task-markdown-link-preview")?.remove();
  activeMarkdownLink = null;
}

function scheduleMarkdownLinkPreviewClose() {
  clearTimeout(markdownLinkPreviewTimer);
  markdownLinkPreviewTimer = setTimeout(closeMarkdownLinkPreview, 140);
}

function showMarkdownLinkPreview(link) {
  clearTimeout(markdownLinkPreviewTimer);
  activeMarkdownLink = link;
  let preview = document.getElementById("task-markdown-link-preview");
  if (!preview) {
    preview = document.createElement("div");
    preview.id = "task-markdown-link-preview";
    preview.className = "task-markdown-link-preview";
    preview.addEventListener("mouseenter", () => clearTimeout(markdownLinkPreviewTimer));
    preview.addEventListener("mouseleave", scheduleMarkdownLinkPreviewClose);
    document.getElementById("task-status-detail")?.appendChild(preview);
  }
  preview.innerHTML = `
    <span class="task-markdown-link-preview__url">${iconSvg("link", 15)}<span>${escapeHtml(link.dataset.linkUrl)}</span></span>
    <button type="button" data-action="copy-markdown-link" title="Скопировать ссылку" aria-label="Скопировать ссылку">${iconSvg("copy", 15)}</button>
    <button type="button" class="task-markdown-link-preview__edit" data-action="edit-markdown-link">Edit</button>
  `;
  const linkRect = link.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const left = Math.max(10, Math.min(linkRect.left, window.innerWidth - previewRect.width - 10));
  const below = linkRect.bottom + 7;
  const top = below + previewRect.height <= window.innerHeight - 10
    ? below
    : linkRect.top - previewRect.height - 7;
  preview.style.left = `${left}px`;
  preview.style.top = `${Math.max(10, top)}px`;
}

function closeMarkdownLinkDialog() {
  document.getElementById("task-markdown-link-dialog")?.remove();
  markdownLinkDialogState = null;
}

function openMarkdownLinkDialog(link = null, editor = null) {
  closeMarkdownLinkPreview();
  closeMarkdownLinkDialog();
  const targetEditor = editor || link?.closest("[data-markdown-field]");
  if (!targetEditor) return;
  const selection = window.getSelection();
  const selectedRange = !link && selection?.rangeCount && targetEditor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ? selection.getRangeAt(0).cloneRange()
    : null;
  const selectedText = selectedRange && !selectedRange.collapsed ? selectedRange.toString().trim() : "";
  markdownLinkDialogState = { link, editor: targetEditor, range: selectedRange };

  const dialog = document.createElement("div");
  dialog.id = "task-markdown-link-dialog";
  dialog.className = "task-markdown-link-dialog";
  dialog.innerHTML = `
    <div class="task-markdown-link-dialog__overlay" data-action="close-markdown-link-dialog"></div>
    <div class="task-markdown-link-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="task-markdown-link-title">
      <h3 id="task-markdown-link-title">${link ? "Редактировать ссылку" : "Добавить ссылку"}</h3>
      <label><span>Page or URL</span><input type="url" value="${escapeHtml(link?.dataset.linkUrl || "https://")}" data-markdown-link-url></label>
      <label><span>Link title</span><input type="text" maxlength="300" value="${escapeHtml(link?.textContent || selectedText)}" data-markdown-link-title></label>
      <p class="task-markdown-link-dialog__error" data-markdown-link-error></p>
      ${link ? `<button class="task-markdown-link-dialog__remove" type="button" data-action="remove-markdown-link">${iconSvg("trash", 15)}<span>Remove link</span></button>` : ""}
      <div class="task-markdown-link-dialog__actions">
        <button type="button" data-action="close-markdown-link-dialog">Отмена</button>
        <button type="button" class="task-markdown-link-dialog__save" data-action="save-markdown-link">Сохранить</button>
      </div>
    </div>
  `;
  document.getElementById("task-status-detail")?.appendChild(dialog);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMarkdownLinkDialog();
    }
    if (event.key === "Enter" && event.target.matches("input")) {
      event.preventDefault();
      saveMarkdownLinkDialog();
    }
  });
  const titleInput = dialog.querySelector("[data-markdown-link-title]");
  titleInput?.focus();
  titleInput?.select();
}

function saveMarkdownLinkDialog() {
  if (!markdownLinkDialogState) return;
  const dialog = document.getElementById("task-markdown-link-dialog");
  const text = dialog?.querySelector("[data-markdown-link-title]")?.value.trim();
  const value = dialog?.querySelector("[data-markdown-link-url]")?.value.trim();
  const error = dialog?.querySelector("[data-markdown-link-error]");
  if (!text || !safeUrl(value)) {
    if (error) error.textContent = "Укажите текст и корректный адрес http:// или https://";
    return;
  }
  const { editor, range } = markdownLinkDialogState;
  const link = markdownLinkDialogState.link || document.createElement("a");
  setMarkdownLink(link, text, value);
  if (markdownLinkDialogState.link) syncMarkdownEditor(editor);
  else placeMarkdownLink(editor, link, range);
  closeMarkdownLinkDialog();
}

function removeMarkdownLink() {
  const { link, editor } = markdownLinkDialogState || {};
  if (!link || !editor) return;
  link.replaceWith(document.createTextNode(link.textContent));
  syncMarkdownEditor(editor);
  closeMarkdownLinkDialog();
  editor.focus();
}

function getStatus(id) {
  return board.statuses.find((status) => status.id === id) || board.statuses[0];
}

function getTask(id) {
  return board.tasks.find((task) => task.id === id) || null;
}

function visibleMode() {
  return (localStorage.getItem("linkMode") || "default") === "work";
}

function setSaveLabel(text, state = "") {
  const label = document.querySelector("#task-status-save-state");
  if (!label) return;
  label.textContent = text;
  label.dataset.state = state;
}

function persistNow({ render = true } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (taskDraft) {
    const task = getTask(taskDraft.id);
    if (task) Object.assign(task, taskDraft, { updatedAt: Date.now() });
  }
  board = saveTaskBoard(board);
  pendingStatusFields.clear();
  pendingTaskFields.clear();
  pendingLinkFields.clear();
  pendingResponsibleFields.clear();
  scheduleReminder();
  renderLauncher();
  setSaveLabel("Сохранено", "saved");
  clearTimeout(saveLabelTimer);
  saveLabelTimer = setTimeout(() => setSaveLabel("Все изменения сохранены", ""), 1600);
  if (render) renderBoardContent();
}

function scheduleTextSave() {
  clearTimeout(saveTimer);
  setSaveLabel("Сохранение через 3 сек.", "pending");
  saveTimer = setTimeout(() => persistNow({ render: false }), 3000);
}

function flushPendingSave() {
  if (saveTimer) persistNow({ render: false });
}

function countTasks(statusId) {
  return board.tasks.filter((task) => task.statusId === statusId).length;
}

function buildPmStatusSummary() {
  const date = new Date().toLocaleDateString("ru-RU");
  const formatTask = (task, nested = false, parentStatusId = "") => {
    const taskId = String(task.code || "").trim();
    const trackerLink = task.links.find((link) => link.label.trim().toLocaleLowerCase("ru") === "tracker");
    const trackerUrl = safeUrl(trackerLink?.url);
    const linkedTaskId = taskId && trackerUrl ? `[${taskId}](${trackerUrl})` : taskId;
    const title = String(task.title || "Без названия").trim();
    const dailyUpdate = String(task.dailyUpdate || "").replace(/\s+/g, " ").trim() || "Статус по задаче не заполнен";
    const taskStatus = getStatus(task.statusId);
    const statusNote = nested && task.statusId !== parentStatusId
      ? ` _(${SUMMARY_STATUS_ICONS[taskStatus.icon] || "•"} ${taskStatus.name})_`
      : "";
    return `${nested ? "    - ↳ " : "- "}${[linkedTaskId, title, dailyUpdate].filter(Boolean).join(" - ")}${statusNote}`;
  };
  const sections = board.statuses.map((status) => {
    const tasks = board.tasks.filter((task) => task.statusId === status.id && !task.parentId);
    if (!tasks.length) return "";
    const icon = SUMMARY_STATUS_ICONS[status.icon] || "•";
    const lines = tasks.flatMap((task) => [
      formatTask(task),
      ...board.tasks.filter((child) => child.parentId === task.id).map((child) => formatTask(child, true, task.statusId))
    ]);
    return [`**${icon} ${status.name}**`, ...lines].join("\n");
  }).filter(Boolean);
  return [`Статусы задач на ${date}`, ...sections].join("\n\n");
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function setSummaryButtonState(text, state = "") {
  const button = document.querySelector('[data-action="copy-summary"]');
  if (!button) return;
  button.classList.toggle("task-board__summary-btn--success", state === "success");
  button.classList.toggle("task-board__summary-btn--error", state === "error");
  const label = button.querySelector("span");
  if (label) label.textContent = text;
}

function dateToDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
}

function todayDayNumber() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short"
  });
}

function getDueState(task) {
  if (task?.statusId === DONE_STATUS_ID) return null;
  const targetDay = dateToDayNumber(task?.dueDate);
  if (targetDay === null) return null;
  const daysLeft = targetDay - todayDayNumber();
  if (daysLeft < 0) return { type: "overdue", label: "Просрочено", attention: true };
  if (daysLeft === 0) return { type: "today", label: "Нужно сегодня", attention: true };
  if (daysLeft === 1) return { type: "tomorrow", label: "Нужно завтра", attention: true };
  return { type: "upcoming", label: formatDueDate(task.dueDate), attention: false };
}

function getDueSummary() {
  return board.tasks.reduce((summary, task) => {
    if (task.statusId === DONE_STATUS_ID) return summary;
    const dueState = getDueState(task);
    if (dueState?.attention) summary[dueState.type] += 1;
    if (task.attention) summary.marked += 1;
    return summary;
  }, { overdue: 0, today: 0, tomorrow: 0, marked: 0 });
}

function scheduleDueRefresh() {
  clearTimeout(dueRefreshTimer);
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dueRefreshTimer = setTimeout(() => {
    board = loadTaskBoard();
    renderLauncher();
    renderBoardContent();
    scheduleDueRefresh();
  }, Math.max(1000, nextDay.getTime() - now.getTime() + 150));
}

function getReminderTarget(date) {
  const [hours, minutes] = String(board.reminder?.time || "18:00").split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function isReminderDay(date) {
  return board.reminder?.weekdays?.includes(date.getDay()) || false;
}

function getTasksWithoutTodayUpdate() {
  const today = localDateStamp();
  return board.tasks.filter((task) => task.statusId !== DONE_STATUS_ID
    && (task.dailyUpdateDate !== today || !String(task.dailyUpdate || "").trim()));
}

function showDailyUpdateReminder() {
  const now = new Date();
  if (!board.reminder?.enabled || !isReminderDay(now) || now < getReminderTarget(now)) return;
  const missingTasks = getTasksWithoutTodayUpdate();
  if (!missingTasks.length) return;
  publishTaskReminder(missingTasks.length);
}

function scheduleReminder() {
  clearTimeout(reminderTimer);
  reminderTimer = null;
  if (!board.reminder?.enabled) return;

  const now = new Date();
  const todayTarget = getReminderTarget(now);
  const reminderIsDue = isReminderDay(now) && now >= todayTarget;

  if (reminderIsDue) showDailyUpdateReminder();

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!isReminderDay(day)) continue;
    const target = getReminderTarget(day);
    if (target <= now) continue;
    reminderTimer = setTimeout(() => {
      showDailyUpdateReminder();
      scheduleReminder();
    }, target.getTime() - now.getTime() + 150);
    break;
  }
}

function renderLauncher() {
  const host = document.getElementById("task-statuses");
  if (!host) return;
  host.hidden = !visibleMode();
  if (host.hidden) return;

  const dueSummary = getDueSummary();
  const attentionCount = board.tasks.filter((task) => task.statusId !== DONE_STATUS_ID && (task.attention || getDueState(task)?.attention)).length;
  const badgeState = dueSummary.marked ? "attention" : dueSummary.overdue ? "overdue" : dueSummary.today ? "today" : "tomorrow";
  const badgeTitle = `Требуют внимания: ${dueSummary.marked} · Просрочено: ${dueSummary.overdue} · Сегодня: ${dueSummary.today} · Завтра: ${dueSummary.tomorrow}`;
  host.innerHTML = `
    <button class="task-status-btn" id="task-status-btn" type="button" aria-label="Открыть статусы по задачам${attentionCount ? `. ${badgeTitle}` : ""}" ${driveRestoreRunning ? "disabled" : ""}>
      <span class="task-status-btn__icon">${iconSvg("flask", 17)}</span>
      <span>${driveRestoreRunning ? "Загрузка..." : "Статусы"}</span>
      ${attentionCount ? `<span class="task-status-btn__badge task-status-btn__badge--${badgeState}" title="${badgeTitle}">${attentionCount}</span>` : ""}
    </button>
  `;
  host.querySelector("#task-status-btn")?.addEventListener("click", openBoard);
}

function matchesSearch(task) {
  if (!searchQuery) return true;
  const links = task.links.map((link) => `${link.label} ${link.url}`).join(" ");
  const sprint = board.sprints.find((item) => item.id === task.sprintId)?.name || "";
  return `${task.code} ${task.title} ${task.description} ${links} ${sprint}`.toLocaleLowerCase("ru").includes(searchQuery);
}

function matchesUrgentFilter(task) {
  if (!showUrgentOnly) return true;
  if (task.statusId === DONE_STATUS_ID) return false;
  const dueState = getDueState(task);
  return task.attention || dueState?.type === "today" || dueState?.type === "tomorrow" || dueState?.type === "overdue";
}

function orderedTasksForStatus(statusId) {
  const statusTasks = board.tasks.filter((task) => (
    task.statusId === statusId && matchesSearch(task) && matchesUrgentFilter(task)
  ));
  const visibleIds = new Set(statusTasks.map((task) => task.id));
  const result = [];
  const added = new Set();

  statusTasks.filter((task) => !task.parentId || !visibleIds.has(task.parentId)).forEach((task) => {
    result.push(task);
    added.add(task.id);
    statusTasks.filter((child) => child.parentId === task.id).forEach((child) => {
      result.push(child);
      added.add(child.id);
    });
  });
  statusTasks.forEach((task) => {
    if (!added.has(task.id)) result.push(task);
  });
  return result;
}

function renderTaskRow(task) {
  const parent = task.parentId ? getTask(task.parentId) : null;
  const links = task.links.filter((link) => safeUrl(link.url));
  const dueState = getDueState(task);
  return `
    <article class="task-board__task ${parent ? "task-board__task--child" : ""} ${task.attention ? "task-board__task--attention" : ""}" draggable="true" data-task-id="${escapeHtml(task.id)}" tabindex="0">
      <span class="task-board__drag" title="Перетащить">⠿</span>
      <span class="task-board__document" style="${taskMarkerStyle(task)}">${renderTaskMarker(task.markerIcon, 15)}</span>
      ${parent ? '<span class="task-board__branch" aria-hidden="true"></span>' : ""}
      <div class="task-board__task-main">
        <div class="task-board__task-line">
          ${task.code ? `<span class="task-board__code">${escapeHtml(task.code)}</span>` : ""}
          <strong>${escapeHtml(task.title || "Без названия")}</strong>
        </div>
        ${parent && (parent.statusId !== task.statusId || parent.sprintId !== task.sprintId) ? `<span class="task-board__parent-note">Подзадача: ${escapeHtml(parent.title)}</span>` : ""}
        ${task.description ? `<p>${escapeHtml(task.description).replace(/\n+/g, " ")}</p>` : ""}
      </div>
      ${dueState || links.length ? `<div class="task-board__meta">${dueState ? `<span class="task-board__due task-board__due--${dueState.type}" title="Срок: ${escapeHtml(formatDueDate(task.dueDate))}">${iconSvg("clock", 14)}${escapeHtml(dueState.label)}</span>` : ""}${links.length ? `<div class="task-board__links">${links.slice(0, 4).map((link) => `<a href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer" data-stop-open>${escapeHtml(link.label || "Ссылка")}</a>`).join("")}</div>` : ""}</div>` : ""}
      <button class="task-board__more" type="button" data-action="open-task" data-task-id="${escapeHtml(task.id)}" aria-label="Открыть задачу">•••</button>
    </article>
  `;
}

function renderSprintGroup(sprint, tasks) {
  const sprintId = sprint?.id || UNASSIGNED_SPRINT_ID;
  const collapsed = collapsedSprints.has(sprintId);
  return `
    <section class="task-board__sprint ${collapsed ? "task-board__sprint--collapsed" : ""}" data-drop-sprint="${escapeHtml(sprint?.id || "")}" data-drop-status="${DONE_STATUS_ID}">
      <div class="task-board__sprint-head">
        <button class="task-board__sprint-toggle" type="button" data-action="toggle-sprint" data-sprint-id="${escapeHtml(sprintId)}" aria-expanded="${!collapsed}">
          <span class="task-board__sprint-chevron">${iconSvg("chevron", 15)}</span>
          <strong>${escapeHtml(sprint?.name || "Без спринта")}</strong>
          <span class="task-board__sprint-count">${tasks.length}</span>
        </button>
        ${sprint ? `
          <button class="task-board__sprint-icon" type="button" data-action="edit-sprint" data-sprint-id="${escapeHtml(sprint.id)}" title="Переименовать спринт" aria-label="Переименовать спринт ${escapeHtml(sprint.name)}">✎</button>
          <button class="task-board__sprint-icon task-board__sprint-icon--danger" type="button" data-action="delete-sprint" data-sprint-id="${escapeHtml(sprint.id)}" title="Удалить спринт" aria-label="Удалить спринт ${escapeHtml(sprint.name)}">×</button>
        ` : ""}
      </div>
      <div class="task-board__sprint-tasks" ${collapsed ? "hidden" : ""}>
        ${tasks.length ? tasks.map(renderTaskRow).join("") : sprint
          ? '<div class="task-board__sprint-empty">Задач пока нет</div>'
          : `<button class="task-board__empty" type="button" data-action="create-task" data-status-id="${DONE_STATUS_ID}">+ Добавить задачу</button>`}
      </div>
    </section>
  `;
}

function renderDoneTasks(tasks) {
  if (!tasks.length && (searchQuery || showUrgentOnly)) {
    return `<div class="task-board__empty-state">${showUrgentOnly ? "Нет срочных задач" : "Ничего не найдено"}</div>`;
  }
  return `
    <div class="task-board__sprint-toolbar">
      ${sprintEditor ? `
        <form class="task-board__sprint-form" data-sprint-form>
          <label class="task-board__field"><span>${sprintEditor.id ? "Переименовать спринт" : "Новый спринт"}</span><input type="text" maxlength="80" required data-sprint-name value="${escapeHtml(sprintEditor.name)}" placeholder="Название спринта"></label>
          <button class="task-board__secondary" type="submit">Сохранить</button>
          <button class="task-board__sprint-icon" type="button" data-action="cancel-sprint" aria-label="Отмена">×</button>
        </form>
      ` : '<button class="task-board__secondary" type="button" data-action="add-sprint">+ Спринт</button>'}
    </div>
    ${renderSprintGroup(null, tasks.filter((task) => !task.sprintId))}
    ${board.sprints.map((sprint) => renderSprintGroup(sprint, tasks.filter((task) => task.sprintId === sprint.id))).join("")}
  `;
}

function renderStatusSection(status) {
  const tasks = orderedTasksForStatus(status.id);
  const collapsed = (!tasks.length && status.id !== DONE_STATUS_ID) || collapsedStatuses.has(status.id);
  const emptyContent = showUrgentOnly
    ? '<div class="task-board__empty-state">Нет срочных задач</div>'
    : searchQuery
      ? '<div class="task-board__empty-state">Ничего не найдено</div>'
      : `<button class="task-board__empty" type="button" data-action="create-task" data-status-id="${escapeHtml(status.id)}">+ Добавить задачу</button>`;
  return `
    <section class="task-board__status ${collapsed ? "task-board__status--collapsed" : ""}" data-status-id="${escapeHtml(status.id)}" style="${statusStyle(status)}">
      <button class="task-board__status-head" type="button" data-action="toggle-status" data-status-id="${escapeHtml(status.id)}" title="${escapeHtml(status.description)}">
        <span class="task-board__chevron">${iconSvg("chevron", 16)}</span>
        <span class="task-board__status-icon">${iconSvg(status.icon, 18)}</span>
        <strong>${escapeHtml(status.name)}</strong>
        <span class="task-board__count">${tasks.length}</span>
      </button>
      <div class="task-board__task-list" data-drop-status="${escapeHtml(status.id)}">
        ${status.id === DONE_STATUS_ID ? renderDoneTasks(tasks) : tasks.length ? tasks.map(renderTaskRow).join("") : emptyContent}
      </div>
    </section>
  `;
}

function renderStatusEditor() {
  const testPending = isTaskReminderTestPending();
  return `
    <div class="task-board__settings">
      <div class="task-board__settings-layout">
        <section class="task-board__statuses-settings">
          <div class="task-board__settings-head">
            <button type="button" class="task-board__secondary" data-action="add-status">+ Статус</button>
          </div>
          <div class="task-board__settings-list">
            ${board.statuses.map((status) => `
              <section class="task-status-edit" data-status-editor="${escapeHtml(status.id)}" style="${statusStyle(status)}">
                <div class="task-status-edit__top">
                  <span class="task-status-edit__drag" draggable="true" data-status-drag="${escapeHtml(status.id)}" title="Перетащить статус" aria-label="Перетащить статус">⠿</span>
                  <div class="task-status-edit__icon-picker">
                    <button type="button" class="task-status-edit__preview" data-action="toggle-status-icon-picker" data-status-id="${escapeHtml(status.id)}" title="${status.id === DONE_STATUS_ID ? "Обязательный статус" : "Изменить иконку"}" aria-expanded="false" ${status.id === DONE_STATUS_ID ? "disabled" : ""}>${iconSvg(status.icon, 19)}</button>
                    <div class="task-status-edit__icons" data-status-icon-options="${escapeHtml(status.id)}" role="radiogroup" aria-label="Иконка статуса" hidden>
                      ${ICONS.map((icon) => `<button type="button" class="task-status-edit__icon ${status.icon === icon.id ? "task-status-edit__icon--active" : ""}" data-action="set-status-icon" data-status-id="${escapeHtml(status.id)}" data-icon="${icon.id}" title="${icon.label}">${iconSvg(icon.id, 17)}</button>`).join("")}
                    </div>
                  </div>
                  <label class="task-board__field task-board__field--grow"><span>Название</span><input type="text" value="${escapeHtml(status.name)}" maxlength="60" data-status-field="name" data-status-id="${escapeHtml(status.id)}" ${status.id === DONE_STATUS_ID ? 'disabled title="Обязательный статус"' : ""}></label>
                  <label class="task-status-edit__color" title="Цвет"><input type="color" value="${escapeHtml(status.color)}" data-status-field="color" data-status-id="${escapeHtml(status.id)}"><span style="background:${escapeHtml(status.color)}"></span></label>
                  <button type="button" class="task-board__icon-btn task-board__icon-btn--danger" data-action="delete-status" data-status-id="${escapeHtml(status.id)}" title="${status.id === DONE_STATUS_ID ? "Обязательный статус" : "Удалить статус"}" ${status.id === DONE_STATUS_ID || board.statuses.length === 1 ? "disabled" : ""}>×</button>
                </div>
                <label class="task-board__field"><span>Описание статуса</span><input type="text" value="${escapeHtml(status.description)}" maxlength="300" placeholder="Например: ждём макет от дизайнера" data-status-field="description" data-status-id="${escapeHtml(status.id)}"></label>
              </section>
            `).join("")}
          </div>
        </section>
        <aside class="task-board__reminder-column">
          <section class="task-board__reminder-settings">
            <span class="task-board__reminder-icon">${iconSvg("bell", 19)}</span>
            <div class="task-board__reminder-copy"><strong>Напоминание</strong><span>Если не заполнено «Что сделано сегодня»</span></div>
            <label class="task-board__switch"><input type="checkbox" data-reminder-field="enabled" ${board.reminder.enabled ? "checked" : ""}><span></span></label>
            <label class="task-board__reminder-time"><span>Время</span><input type="time" value="${escapeHtml(board.reminder.time)}" data-reminder-field="time"></label>
            <button class="task-board__reminder-test" type="button" data-action="test-reminder" ${testPending ? "disabled" : ""}>${testPending ? "Сработает через 5 сек..." : "Тест через 5 сек."}</button>
            <div class="task-board__reminder-days" aria-label="Дни напоминания">
              ${REMINDER_DAYS.map((day) => `<label><input type="checkbox" data-reminder-day="${day.value}" ${board.reminder.weekdays.includes(day.value) ? "checked" : ""}><span>${day.label}</span></label>`).join("")}
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderBoardContent() {
  const modal = document.getElementById("task-status-modal");
  if (!modal) return;
  const filters = modal.querySelector("#task-board-filters");
  const content = modal.querySelector("#task-board-content");
  const settingsBtn = modal.querySelector('[data-action="toggle-settings"]');
  const toolbar = modal.querySelector(".task-board__toolbar");
  const footer = modal.querySelector(".task-board__footer");
  if (!filters || !content) return;

  toolbar?.classList.toggle("task-board__section--hidden", editingStatuses);
  footer?.classList.toggle("task-board__section--hidden", editingStatuses);

  filters.innerHTML = board.statuses.map((status) => `
    <button type="button" class="task-board__filter ${selectedStatusId === status.id ? "task-board__filter--active" : ""}" data-action="filter-status" data-status-id="${escapeHtml(status.id)}" style="${statusStyle(status)}">
      <span></span>${escapeHtml(status.name)}<b>${countTasks(status.id)}</b>
    </button>
  `).join("");
  settingsBtn?.classList.toggle("task-board__icon-btn--active", editingStatuses);

  if (editingStatuses) {
    content.innerHTML = renderStatusEditor();
    return;
  }
  const statuses = selectedStatusId ? board.statuses.filter((status) => status.id === selectedStatusId) : board.statuses;
  content.innerHTML = statuses.map(renderStatusSection).join("");
}

function openBoard() {
  if (driveRestoreRunning || document.getElementById("task-status-modal")) return;
  board = loadTaskBoard();
  const modal = document.createElement("div");
  modal.id = "task-status-modal";
  modal.className = "task-board-modal";
  modal.innerHTML = `
    <div class="task-board-modal__overlay" data-action="close-board"></div>
    <div class="task-board" role="dialog" aria-modal="true" aria-label="Статусы по задачам">
      <header class="task-board__header">
        <div><h2>Статусы по задачам</h2><p id="task-status-save-state">Все изменения сохранены</p></div>
        <div class="task-board__header-actions">
          <button class="task-board__icon-btn" type="button" data-action="toggle-settings" title="Настройки статусов и напоминаний">${iconSvg("settings", 20)}</button>
          <button class="task-board__close" type="button" data-action="close-board" aria-label="Закрыть">×</button>
        </div>
      </header>
      <div class="task-board__toolbar">
        <nav class="task-board__filters" id="task-board-filters" aria-label="Фильтры по статусам"></nav>
        <div class="task-board__toolbar-right" aria-label="Инструменты задач">
          <label class="task-board__urgent-filter" title="Отображать срочные" aria-label="Отображать срочные">
            <input id="task-board-urgent" type="checkbox" ${showUrgentOnly ? "checked" : ""}>
            <span class="task-board__urgent-check">${iconSvg("alert", 19)}</span>
          </label>
          <label class="task-board__search">
            ${iconSvg("eye", 17)}
            <input id="task-board-search" type="search" placeholder="Поиск по задачам, коду или описанию..." autocomplete="off">
          </label>
          <button class="task-board__summary-btn" type="button" data-action="copy-summary" title="Скопировать краткий статус для PM" aria-label="Скопировать краткий статус для PM">
            ${iconSvg("copy", 16)}<span>Скопировать</span>
          </button>
        </div>
      </div>
      <main class="task-board__content" id="task-board-content"></main>
      <footer class="task-board__footer"><button class="task-board__primary" type="button" data-action="create-task">+ Создать карточку</button></footer>
    </div>
  `;
  document.body.appendChild(modal);
  attachBoardEvents(modal);
  renderBoardContent();
  modal.querySelector("#task-board-search")?.focus();
}

function closeBoard() {
  closeTaskDetail();
  flushPendingSave();
  document.getElementById("task-status-modal")?.remove();
  editingStatuses = false;
  sprintEditor = null;
  selectedStatusId = "";
  searchQuery = "";
}

function parentOptions(task) {
  return board.tasks.filter((candidate) => candidate.id !== task.id && !candidate.parentId);
}

function renderTaskDetail() {
  const modal = document.getElementById("task-status-modal");
  if (!modal || !taskDraft) return;
  modal.querySelector("#task-status-detail")?.remove();
  const status = getStatus(taskDraft.statusId);
  const detail = document.createElement("aside");
  detail.id = "task-status-detail";
  detail.className = "task-detail";
  detail.innerHTML = `
    <div class="task-detail__overlay" data-action="close-task"></div>
    <div class="task-detail__panel" role="dialog" aria-modal="true" aria-label="Карточка задачи">
      <header class="task-detail__header" style="${statusStyle(status)}">
        <div class="task-detail__eyebrow"><span>${iconSvg(status.icon, 16)}</span>${escapeHtml(status.name)}</div>
        <button class="task-board__close" type="button" data-action="close-task" aria-label="Закрыть">×</button>
      </header>
      <div class="task-detail__body">
        <div class="task-detail__row">
          <div class="task-detail__marker-picker">
            <button class="task-detail__marker-trigger" type="button" data-action="toggle-task-marker-picker" style="${taskMarkerStyle(taskDraft)}" aria-expanded="${markerPickerOpen}" title="Изменить иконку и цвет">
              ${renderTaskMarker(taskDraft.markerIcon, 16)}${iconSvg("chevron", 13)}
            </button>
            <div class="task-detail__marker-popover" ${markerPickerOpen ? "" : "hidden"}>
              <div class="task-detail__marker-options" role="radiogroup" aria-label="Иконка задачи">
                ${TASK_MARKERS.map((marker) => `<button class="task-detail__marker-option ${taskDraft.markerIcon === marker ? "task-detail__marker-option--active" : ""}" type="button" data-action="set-task-marker" data-marker-icon="${escapeHtml(marker)}" style="${taskMarkerStyle(taskDraft)}" title="Выбрать иконку">${renderTaskMarker(marker, 15)}</button>`).join("")}
              </div>
              <label class="task-detail__marker-color" title="Цвет обводки">
                <span class="task-detail__marker-color-label">Цвет обводки</span>
                <input type="color" value="${escapeHtml(taskDraft.markerColor)}" data-task-marker-color>
                <span class="task-detail__marker-color-swatch" style="background:${escapeHtml(taskDraft.markerColor)}"></span>
              </label>
            </div>
          </div>
          <label class="task-board__field task-board__field--code"><span>Код / ID</span><input type="text" maxlength="50" value="${escapeHtml(taskDraft.code)}" placeholder="ONBL-2050" data-task-field="code"></label>
          <label class="task-board__field task-board__field--grow"><span>Название задачи</span><input type="text" maxlength="240" value="${escapeHtml(taskDraft.title)}" data-task-field="title"></label>
          <label class="task-detail__attention" title="Требует внимания">
            <input type="checkbox" data-task-attention ${taskDraft.attention ? "checked" : ""}>
            <span>${iconSvg("check", 13)}</span>
            <b>Требует внимания</b>
          </label>
        </div>
        <div class="task-detail__row">
          <label class="task-board__field"><span>Статус</span><select data-task-field="statusId">${board.statuses.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === taskDraft.statusId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
          <label class="task-board__field task-board__field--grow"><span>Родительская задача</span><select data-task-field="parentId"><option value="">Нет, это общая задача</option>${parentOptions(taskDraft).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === taskDraft.parentId ? "selected" : ""}>${escapeHtml(item.code ? `${item.code} · ${item.title}` : item.title)}</option>`).join("")}</select></label>
          <label class="task-board__field task-board__field--date"><span>Срок</span><input type="date" value="${escapeHtml(taskDraft.dueDate)}" data-task-field="dueDate"></label>
        </div>
        ${taskDraft.statusId === DONE_STATUS_ID ? `
          <div class="task-detail__row task-detail__sprint-row">
            <label class="task-board__field task-board__field--grow"><span>Спринт</span><select data-task-field="sprintId"><option value="">Без спринта</option>${board.sprints.map((sprint) => `<option value="${escapeHtml(sprint.id)}" ${sprint.id === taskDraft.sprintId ? "selected" : ""}>${escapeHtml(sprint.name)}</option>`).join("")}</select></label>
            <button class="task-board__secondary" type="button" data-action="show-task-sprint-form">+ Новый спринт</button>
          </div>
          <form class="task-detail__sprint-form" data-task-sprint-form hidden>
            <label class="task-board__field task-board__field--grow"><span>Название нового спринта</span><input type="text" maxlength="80" required data-sprint-name placeholder="Например: Спринт 1"></label>
            <button class="task-board__secondary" type="submit">Создать</button>
            <button class="task-board__sprint-icon" type="button" data-action="hide-task-sprint-form" aria-label="Отмена">×</button>
          </form>
        ` : ""}
        <div class="task-board__field task-detail__markdown-field">
          <span class="task-detail__markdown-head"><span>Описание</span><button type="button" data-action="add-markdown-link" data-markdown-field="description">+ Ссылка</button></span>
          <div class="task-detail__markdown-editor task-detail__markdown-editor--description" contenteditable="true" role="textbox" aria-multiline="true" data-markdown-field="description" data-placeholder="Контекст, текущее состояние и важные детали..." spellcheck="true">${renderMarkdownEditor(taskDraft.description)}</div>
        </div>
        <div class="task-board__field task-detail__daily-update task-detail__markdown-field">
          <span class="task-detail__markdown-head"><span>Статус по задаче</span><button type="button" data-action="add-markdown-link" data-markdown-field="dailyUpdate">+ Ссылка</button></span>
          <div class="task-detail__markdown-editor task-detail__markdown-editor--daily" contenteditable="true" role="textbox" aria-multiline="true" data-markdown-field="dailyUpdate" data-placeholder="Что было сделано за сегодня по этой задаче..." spellcheck="true">${renderMarkdownEditor(taskDraft.dailyUpdate)}</div>
          ${taskDraft.dailyUpdateDate ? `<small>Последнее обновление: ${escapeHtml(formatDueDate(taskDraft.dailyUpdateDate))}</small>` : ""}
        </div>
        <section class="task-detail__links">
          <div class="task-detail__section-title"><div><h3>Материалы</h3><p>Макет, аналитика, фича-ветка и другие ссылки</p></div><button class="task-board__secondary" type="button" data-action="add-link">+ Ссылка</button></div>
          <div class="task-detail__link-list">
            ${taskDraft.links.length ? taskDraft.links.map((link) => `
              <div class="task-detail__link" data-link-id="${escapeHtml(link.id)}">
                <input type="text" maxlength="80" value="${escapeHtml(link.label)}" placeholder="Название" data-link-field="label" data-link-id="${escapeHtml(link.id)}">
                <input type="url" maxlength="2000" value="${escapeHtml(link.url)}" placeholder="https://..." data-link-field="url" data-link-id="${escapeHtml(link.id)}">
                ${safeUrl(link.url) ? `<a href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer" title="Открыть ссылку">↗</a>` : ""}
                <button type="button" data-action="delete-link" data-link-id="${escapeHtml(link.id)}" title="Удалить ссылку">×</button>
              </div>
            `).join("") : '<p class="task-detail__empty">Ссылок пока нет</p>'}
          </div>
        </section>
        <section class="task-detail__responsibles">
          <div class="task-detail__section-title"><div><h3>Ответственные</h3><p>Участники задачи и их роли</p></div><button class="task-board__secondary" type="button" data-action="add-responsible">+ Ответственный</button></div>
          <div class="task-detail__responsible-list">
            ${taskDraft.responsibles.length ? taskDraft.responsibles.map((responsible) => `
              <div class="task-detail__responsible" data-responsible-id="${escapeHtml(responsible.id)}">
                <input type="text" maxlength="80" value="${escapeHtml(responsible.role)}" placeholder="Роль" data-responsible-field="role" data-responsible-id="${escapeHtml(responsible.id)}">
                <input type="text" maxlength="160" value="${escapeHtml(responsible.name)}" placeholder="Имя или команда" data-responsible-field="name" data-responsible-id="${escapeHtml(responsible.id)}">
                <button type="button" data-action="delete-responsible" data-responsible-id="${escapeHtml(responsible.id)}" title="Удалить ответственного">×</button>
              </div>
            `).join("") : '<p class="task-detail__empty">Ответственных пока нет</p>'}
          </div>
        </section>
      </div>
      <footer class="task-detail__footer">
        <button class="task-board__danger" type="button" data-action="delete-task">Удалить задачу</button>
      </footer>
    </div>
  `;
  modal.appendChild(detail);
  detail.querySelector('[data-task-field="title"]')?.focus();
}

function openTask(taskId) {
  flushPendingSave();
  const task = getTask(taskId);
  if (!task) return;
  markerPickerOpen = false;
  taskDraft = {
    ...task,
    links: task.links.map((link) => ({ ...link })),
    responsibles: task.responsibles.map((responsible) => ({ ...responsible }))
  };
  renderTaskDetail();
}

function createTask(statusId = "") {
  const targetStatusId = statusId || selectedStatusId || board.statuses[0]?.id;
  if (!targetStatusId) return;
  const task = makeTask(targetStatusId);
  board.tasks.push(task);
  persistNow();
  openTask(task.id);
}

function closeTaskDetail() {
  if (!taskDraft) return;
  flushPendingSave();
  closeMarkdownLinkPreview();
  closeMarkdownLinkDialog();
  markerPickerOpen = false;
  taskDraft = null;
  document.querySelector("#task-status-detail")?.remove();
  renderBoardContent();
}

function removeTask(taskId) {
  const task = getTask(taskId);
  if (!task || !window.confirm(`Удалить задачу «${task.title}»?`)) return;
  board.tasks = board.tasks.filter((item) => item.id !== taskId);
  board.tasks.forEach((item) => {
    if (item.parentId === taskId) item.parentId = "";
  });
  taskDraft = null;
  document.querySelector("#task-status-detail")?.remove();
  persistNow();
}

function confirmStatusDelete(status) {
  return new Promise((resolve) => {
    document.getElementById("task-status-delete-confirm")?.remove();
    const confirm = document.createElement("div");
    confirm.id = "task-status-delete-confirm";
    confirm.className = "task-status-confirm";
    confirm.innerHTML = `
      <div class="task-status-confirm__overlay" data-confirm-action="cancel"></div>
      <div class="task-status-confirm__dialog" role="alertdialog" aria-modal="true" aria-labelledby="task-status-confirm-title" aria-describedby="task-status-confirm-description">
        <span class="task-status-confirm__icon">${iconSvg("alert", 23)}</span>
        <h3 id="task-status-confirm-title">Точно удалить статус?</h3>
        <p id="task-status-confirm-description">Статус «${escapeHtml(status.name)}» будет удалён. Все его задачи переместятся в первый доступный статус.</p>
        <div class="task-status-confirm__actions">
          <button class="task-status-confirm__cancel" type="button" data-confirm-action="cancel">Отмена</button>
          <button class="task-status-confirm__delete" type="button" data-confirm-action="delete">Удалить</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      confirm.remove();
      resolve(confirmed);
    };
    const handleKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };
    confirm.addEventListener("click", (event) => {
      const action = event.target.closest("[data-confirm-action]")?.dataset.confirmAction;
      if (action === "cancel") close(false);
      if (action === "delete") close(true);
    });
    document.addEventListener("keydown", handleKeydown);
    document.body.appendChild(confirm);
    confirm.querySelector(".task-status-confirm__cancel")?.focus();
  });
}

function moveTask(taskId, statusId, beforeTaskId = "", sprintId = "") {
  const fromIndex = board.tasks.findIndex((task) => task.id === taskId);
  if (fromIndex < 0 || !getStatus(statusId)) return;
  const [task] = board.tasks.splice(fromIndex, 1);
  task.statusId = statusId;
  task.sprintId = statusId === DONE_STATUS_ID && board.sprints.some((sprint) => sprint.id === sprintId) ? sprintId : "";
  task.updatedAt = Date.now();
  const beforeIndex = beforeTaskId ? board.tasks.findIndex((item) => item.id === beforeTaskId) : -1;
  if (beforeIndex >= 0) board.tasks.splice(beforeIndex, 0, task);
  else board.tasks.push(task);
  persistNow();
}

function moveStatus(statusId, targetStatusId, placeAfter) {
  const index = board.statuses.findIndex((status) => status.id === statusId);
  if (index < 0 || statusId === targetStatusId) return;
  const [status] = board.statuses.splice(index, 1);
  const targetIndex = board.statuses.findIndex((item) => item.id === targetStatusId);
  if (targetIndex < 0) {
    board.statuses.splice(index, 0, status);
    return;
  }
  board.statuses.splice(targetIndex + (placeAfter ? 1 : 0), 0, status);
  persistNow();
}

function validatedSprintName(input, editingId = "") {
  const name = input.value.trim();
  const duplicate = board.sprints.some((sprint) => sprint.id !== editingId && sprint.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
  input.setCustomValidity(!name ? "Введите название спринта" : duplicate ? "Спринт с таким названием уже есть" : "");
  if (!input.reportValidity()) return "";
  return name;
}

function attachBoardEvents(modal) {
  modal.addEventListener("click", async (event) => {
    if (event.target.closest("[data-stop-open]")) return;
    const actionTarget = event.target.closest("[data-action]");
    const taskRow = event.target.closest("[data-task-id]");
    if (!actionTarget && taskRow) {
      openTask(taskRow.dataset.taskId);
      return;
    }
    if (!actionTarget) return;
    const { action, taskId, statusId, sprintId, linkId, responsibleId, icon, markerIcon, markdownField } = actionTarget.dataset;

    if (action === "close-board") closeBoard();
    if (action === "close-task") closeTaskDetail();
    if (action === "open-task") openTask(taskId);
    if (action === "create-task") createTask(statusId);
    if (action === "toggle-status") {
      if (statusId !== DONE_STATUS_ID && !orderedTasksForStatus(statusId).length) return;
      collapsedStatuses.has(statusId) ? collapsedStatuses.delete(statusId) : collapsedStatuses.add(statusId);
      saveCollapsedStatuses();
      renderBoardContent();
    }
    if (action === "toggle-sprint") {
      collapsedSprints.has(sprintId) ? collapsedSprints.delete(sprintId) : collapsedSprints.add(sprintId);
      saveCollapsedSprints();
      renderBoardContent();
    }
    if (action === "add-sprint" || action === "edit-sprint") {
      const sprint = board.sprints.find((item) => item.id === sprintId);
      if (action === "edit-sprint" && !sprint) return;
      sprintEditor = { id: sprint?.id || "", name: sprint?.name || "" };
      renderBoardContent();
      modal.querySelector("[data-sprint-form] input")?.focus();
    }
    if (action === "cancel-sprint") {
      sprintEditor = null;
      renderBoardContent();
    }
    if (action === "delete-sprint") {
      const sprint = board.sprints.find((item) => item.id === sprintId);
      if (!sprint || !window.confirm(`Удалить спринт «${sprint.name}»? Задачи останутся в «Готовых» без спринта.`)) return;
      board.sprints = board.sprints.filter((item) => item.id !== sprintId);
      board.tasks.forEach((task) => { if (task.sprintId === sprintId) task.sprintId = ""; });
      if (sprintEditor?.id === sprintId) sprintEditor = null;
      collapsedSprints.delete(sprintId);
      saveCollapsedSprints();
      persistNow();
    }
    if (action === "show-task-sprint-form" && taskDraft) {
      const form = modal.querySelector("[data-task-sprint-form]");
      if (form) {
        form.hidden = false;
        actionTarget.hidden = true;
        form.querySelector("input")?.focus();
      }
    }
    if (action === "hide-task-sprint-form") {
      const form = actionTarget.closest("[data-task-sprint-form]");
      if (form) form.hidden = true;
      modal.querySelector('[data-action="show-task-sprint-form"]')?.removeAttribute("hidden");
    }
    if (action === "filter-status") {
      selectedStatusId = selectedStatusId === statusId ? "" : statusId;
      renderBoardContent();
    }
    if (action === "toggle-settings") {
      flushPendingSave();
      editingStatuses = !editingStatuses;
      renderBoardContent();
    }
    if (action === "test-reminder") {
      scheduleTaskReminderTest();
    }
    if (action === "copy-summary") {
      try {
        await copyText(buildPmStatusSummary());
        setSummaryButtonState("Скопировано", "success");
        setTimeout(() => setSummaryButtonState("Скопировать"), 1800);
      } catch {
        setSummaryButtonState("Ошибка копирования", "error");
        setTimeout(() => setSummaryButtonState("Скопировать"), 2200);
      }
    }
    if (action === "add-markdown-link" && taskDraft) {
      const editor = modal.querySelector(`[data-markdown-field="${markdownField}"][contenteditable="true"]`);
      if (editor) openMarkdownLinkDialog(null, editor);
    }
    if (action === "edit-markdown-link" && activeMarkdownLink) {
      openMarkdownLinkDialog(activeMarkdownLink);
    }
    if (action === "copy-markdown-link" && activeMarkdownLink) {
      try {
        await copyText(activeMarkdownLink.dataset.linkUrl);
      } catch {
        // Clipboard access can be denied by the browser.
      }
    }
    if (action === "close-markdown-link-dialog") {
      closeMarkdownLinkDialog();
    }
    if (action === "save-markdown-link") {
      saveMarkdownLinkDialog();
    }
    if (action === "remove-markdown-link") {
      removeMarkdownLink();
    }
    if (action === "toggle-task-marker-picker" && taskDraft) {
      markerPickerOpen = !markerPickerOpen;
      updateTaskMarkerControls();
    }
    if (action === "set-task-marker" && taskDraft && TASK_MARKERS.includes(markerIcon)) {
      taskDraft.markerIcon = markerIcon;
      markerPickerOpen = false;
      const task = getTask(taskDraft.id);
      if (task) task.markerIcon = markerIcon;
      persistNow({ render: false });
      updateTaskMarkerControls();
    }
    if (action === "add-status") {
      board.statuses.push(makeStatus());
      persistNow();
    }
    if (action === "toggle-status-icon-picker") {
      const options = modal.querySelector(`[data-status-icon-options="${CSS.escape(statusId)}"]`);
      const shouldOpen = options?.hidden === true;
      modal.querySelectorAll("[data-status-icon-options]").forEach((item) => { item.hidden = true; });
      modal.querySelectorAll('[data-action="toggle-status-icon-picker"]').forEach((item) => item.setAttribute("aria-expanded", "false"));
      if (options && shouldOpen) {
        options.hidden = false;
        actionTarget.setAttribute("aria-expanded", "true");
      }
    }
    if (action === "set-status-icon") {
      const status = getStatus(statusId);
      if (status && statusId !== DONE_STATUS_ID) {
        status.icon = icon;
        persistNow();
      }
    }
    if (action === "delete-status") {
      const status = getStatus(statusId);
      if (!status || statusId === DONE_STATUS_ID || board.statuses.length === 1) return;
      const confirmed = await confirmStatusDelete(status);
      if (!confirmed || board.statuses.length === 1 || !board.statuses.some((item) => item.id === statusId)) return;
      board.statuses = board.statuses.filter((item) => item.id !== statusId);
      board.tasks.forEach((task) => {
        if (task.statusId === statusId) task.statusId = board.statuses[0].id;
      });
      collapsedStatuses.delete(statusId);
      saveCollapsedStatuses();
      if (selectedStatusId === statusId) selectedStatusId = "";
      persistNow();
    }
    if (action === "add-link" && taskDraft) {
      taskDraft.links.push(makeTaskLink());
      const task = getTask(taskDraft.id);
      if (task) task.links = taskDraft.links.map((link) => ({ ...link }));
      persistNow({ render: false });
      renderTaskDetail();
    }
    if (action === "delete-link" && taskDraft) {
      taskDraft.links = taskDraft.links.filter((link) => link.id !== linkId);
      const task = getTask(taskDraft.id);
      if (task) task.links = taskDraft.links.map((link) => ({ ...link }));
      persistNow({ render: false });
      renderTaskDetail();
    }
    if (action === "add-responsible" && taskDraft) {
      taskDraft.responsibles.push(makeTaskResponsible());
      const task = getTask(taskDraft.id);
      if (task) task.responsibles = taskDraft.responsibles.map((responsible) => ({ ...responsible }));
      persistNow({ render: false });
      renderTaskDetail();
    }
    if (action === "delete-responsible" && taskDraft) {
      taskDraft.responsibles = taskDraft.responsibles.filter((responsible) => responsible.id !== responsibleId);
      const task = getTask(taskDraft.id);
      if (task) task.responsibles = taskDraft.responsibles.map((responsible) => ({ ...responsible }));
      persistNow({ render: false });
      renderTaskDetail();
    }
    if (action === "delete-task" && taskDraft) removeTask(taskDraft.id);
  });

  modal.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form.matches("[data-sprint-form], [data-task-sprint-form]")) return;
    event.preventDefault();
    const input = form.querySelector("[data-sprint-name]");
    const editingId = form.matches("[data-sprint-form]") ? sprintEditor?.id || "" : "";
    const name = validatedSprintName(input, editingId);
    if (!name) return;

    if (form.matches("[data-task-sprint-form]")) {
      if (!taskDraft || taskDraft.statusId !== DONE_STATUS_ID) return;
      const sprint = makeSprint(name);
      board.sprints.push(sprint);
      taskDraft.sprintId = sprint.id;
      persistNow({ render: false });
      renderTaskDetail();
      return;
    }

    if (editingId) {
      const sprint = board.sprints.find((item) => item.id === editingId);
      if (!sprint) return;
      sprint.name = name;
    } else {
      board.sprints.push(makeSprint(name));
    }
    sprintEditor = null;
    persistNow();
  });

  modal.addEventListener("input", (event) => {
    if (event.target.matches("[data-sprint-name]")) {
      event.target.setCustomValidity("");
      if (event.target.closest("[data-sprint-form]") && sprintEditor) sprintEditor.name = event.target.value;
      return;
    }
    if (event.target.id === "task-board-search") {
      searchQuery = event.target.value.trim().toLocaleLowerCase("ru");
      renderBoardContent();
      return;
    }
    if (event.target.matches("[data-markdown-field][contenteditable]")) {
      syncMarkdownEditor(event.target);
      return;
    }
    const taskField = event.target.dataset.taskField;
    if (taskField && taskDraft && !["statusId", "parentId", "dueDate"].includes(taskField)) {
      taskDraft[taskField] = event.target.value;
      pendingTaskFields.add(taskField);
      if (taskField === "code") {
        const trackerLink = syncTrackerLink(taskDraft);
        if (trackerLink) {
          pendingLinkFields.add(`${trackerLink.id}:url`);
          const trackerInput = modal.querySelector(`[data-link-field="url"][data-link-id="${CSS.escape(trackerLink.id)}"]`);
          if (trackerInput) trackerInput.value = trackerLink.url;
        }
      }
      if (taskField === "dailyUpdate") {
        taskDraft.dailyUpdateDate = localDateStamp();
        pendingTaskFields.add("dailyUpdateDate");
      }
      scheduleTextSave();
      return;
    }
    const linkField = event.target.dataset.linkField;
    if (linkField && taskDraft) {
      const link = taskDraft.links.find((item) => item.id === event.target.dataset.linkId);
      if (link) {
        link[linkField] = event.target.value;
        pendingLinkFields.add(`${link.id}:${linkField}`);
        scheduleTextSave();
      }
      return;
    }
    const responsibleField = event.target.dataset.responsibleField;
    if (responsibleField && taskDraft) {
      const responsible = taskDraft.responsibles.find((item) => item.id === event.target.dataset.responsibleId);
      if (responsible) {
        responsible[responsibleField] = event.target.value;
        pendingResponsibleFields.add(`${responsible.id}:${responsibleField}`);
        scheduleTextSave();
      }
      return;
    }
    const statusField = event.target.dataset.statusField;
    if (statusField && statusField !== "color" && !(statusField === "name" && event.target.dataset.statusId === DONE_STATUS_ID)) {
      const status = getStatus(event.target.dataset.statusId);
      if (status) {
        status[statusField] = event.target.value;
        pendingStatusFields.add(`${status.id}:${statusField}`);
        scheduleTextSave();
      }
    }
  });

  modal.addEventListener("paste", (event) => {
    const editor = event.target.closest("[data-markdown-field][contenteditable]");
    if (!editor) return;
    const value = event.clipboardData?.getData("text/plain") || "";
    const url = safeUrl(value);
    const selection = window.getSelection();
    if (!url || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
    const text = range.toString().trim();
    if (!text) return;
    event.preventDefault();
    const link = document.createElement("a");
    setMarkdownLink(link, text, url);
    placeMarkdownLink(editor, link, range);
  });

  modal.addEventListener("pointerover", (event) => {
    const link = event.target.closest("[data-markdown-link]");
    if (link) showMarkdownLinkPreview(link);
  });
  modal.addEventListener("pointerout", (event) => {
    const link = event.target.closest("[data-markdown-link]");
    if (!link || link.contains(event.relatedTarget)) return;
    scheduleMarkdownLinkPreviewClose();
  });

  modal.addEventListener("change", (event) => {
    if (event.target.matches("[data-task-attention]") && taskDraft) {
      taskDraft.attention = event.target.checked;
      const task = getTask(taskDraft.id);
      if (task) task.attention = taskDraft.attention;
      persistNow({ render: false });
      return;
    }
    if (event.target.matches("[data-task-marker-color]") && taskDraft) {
      taskDraft.markerColor = event.target.value;
      const task = getTask(taskDraft.id);
      if (task) task.markerColor = taskDraft.markerColor;
      persistNow({ render: false });
      updateTaskMarkerControls();
      return;
    }
    if (event.target.id === "task-board-urgent") {
      showUrgentOnly = event.target.checked;
      localStorage.setItem(URGENT_FILTER_KEY, showUrgentOnly ? "1" : "0");
      renderBoardContent();
      return;
    }
    const reminderDay = event.target.dataset.reminderDay;
    if (reminderDay !== undefined) {
      const day = Number(reminderDay);
      const weekdays = new Set(board.reminder.weekdays);
      event.target.checked ? weekdays.add(day) : weekdays.delete(day);
      board.reminder.weekdays = REMINDER_DAYS.map((item) => item.value).filter((value) => weekdays.has(value));
      persistNow();
      return;
    }
    const reminderField = event.target.dataset.reminderField;
    if (reminderField) {
      board.reminder[reminderField] = reminderField === "enabled" ? event.target.checked : event.target.value;
      persistNow();
      return;
    }
    const taskField = event.target.dataset.taskField;
    if (["statusId", "parentId", "dueDate", "sprintId"].includes(taskField) && taskDraft) {
      taskDraft[taskField] = event.target.value;
      if (taskField === "parentId" && taskDraft.parentId) {
        const parent = getTask(taskDraft.parentId);
        if (parent) {
          taskDraft.statusId = parent.statusId;
          taskDraft.sprintId = parent.statusId === DONE_STATUS_ID ? parent.sprintId : "";
        }
      }
      if (taskField === "statusId" && taskDraft.statusId !== DONE_STATUS_ID) taskDraft.sprintId = "";
      const task = getTask(taskDraft.id);
      if (task) Object.assign(task, taskDraft, { links: taskDraft.links.map((link) => ({ ...link })) });
      persistNow({ render: false });
      renderTaskDetail();
      if (taskField === "sprintId" || (taskField === "statusId" && taskDraft.statusId === DONE_STATUS_ID)) {
        modal.querySelector('#task-status-detail [data-task-field="sprintId"]')?.focus();
      }
      return;
    }
    if (event.target.dataset.statusField === "color") {
      const status = getStatus(event.target.dataset.statusId);
      if (status) {
        status.color = event.target.value;
        persistNow();
      }
    }
  });

  modal.addEventListener("dragstart", (event) => {
    const statusHandle = event.target.closest("[data-status-drag]");
    if (statusHandle) {
      draggedTaskId = "";
      draggedStatusId = statusHandle.dataset.statusDrag;
      statusHandle.closest("[data-status-editor]")?.classList.add("task-status-edit--dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedStatusId);
      return;
    }
    const row = event.target.closest("[data-task-id]");
    if (!row) return;
    draggedStatusId = "";
    draggedTaskId = row.dataset.taskId;
    row.classList.add("task-board__task--dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedTaskId);
  });
  modal.addEventListener("dragover", (event) => {
    if (draggedStatusId) {
      const editor = event.target.closest("[data-status-editor]");
      if (!editor || editor.dataset.statusEditor === draggedStatusId) return;
      event.preventDefault();
      const placeAfter = event.clientY > editor.getBoundingClientRect().top + editor.offsetHeight / 2;
      modal.querySelectorAll(".task-status-edit--drop-before, .task-status-edit--drop-after").forEach((item) => item.classList.remove("task-status-edit--drop-before", "task-status-edit--drop-after"));
      editor.classList.add(placeAfter ? "task-status-edit--drop-after" : "task-status-edit--drop-before");
      return;
    }
    const target = event.target.closest("[data-task-id], [data-drop-sprint], [data-drop-status]");
    if (!target || !draggedTaskId) return;
    event.preventDefault();
    modal.querySelectorAll(".task-board__drop-target").forEach((item) => item.classList.remove("task-board__drop-target"));
    target.classList.add("task-board__drop-target");
  });
  modal.addEventListener("drop", (event) => {
    if (draggedStatusId) {
      const editor = event.target.closest("[data-status-editor]");
      if (!editor || editor.dataset.statusEditor === draggedStatusId) return;
      event.preventDefault();
      const placeAfter = event.clientY > editor.getBoundingClientRect().top + editor.offsetHeight / 2;
      moveStatus(draggedStatusId, editor.dataset.statusEditor, placeAfter);
      draggedStatusId = "";
      return;
    }
    const target = event.target.closest("[data-task-id], [data-drop-sprint], [data-drop-status]");
    if (!target || !draggedTaskId) return;
    event.preventDefault();
    const targetTask = target.dataset.taskId ? getTask(target.dataset.taskId) : null;
    const statusId = targetTask?.statusId || target.dataset.dropStatus;
    let beforeTaskId = targetTask?.id || "";
    if (targetTask && event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2) {
      let nextTaskRow = target.nextElementSibling;
      if (nextTaskRow?.dataset.taskId === draggedTaskId) nextTaskRow = nextTaskRow.nextElementSibling;
      beforeTaskId = nextTaskRow?.dataset.taskId || "";
    }
    const targetSprintId = targetTask?.sprintId ?? target.dataset.dropSprint ?? "";
    if (targetTask?.id !== draggedTaskId) moveTask(draggedTaskId, statusId, beforeTaskId, targetSprintId);
    draggedTaskId = "";
  });
  modal.addEventListener("dragend", () => {
    draggedTaskId = "";
    draggedStatusId = "";
    modal.querySelectorAll(".task-board__task--dragging, .task-board__drop-target, .task-status-edit--dragging, .task-status-edit--drop-before, .task-status-edit--drop-after").forEach((item) => item.classList.remove("task-board__task--dragging", "task-board__drop-target", "task-status-edit--dragging", "task-status-edit--drop-before", "task-status-edit--drop-after"));
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.getElementById("task-status-delete-confirm")) return;
  if (taskDraft) closeTaskDetail();
  else if (sprintEditor) {
    sprintEditor = null;
    renderBoardContent();
  }
  else if (document.getElementById("task-status-modal")) closeBoard();
});

window.addEventListener("space-tab:link-mode-changed", () => {
  renderLauncher();
  if (!visibleMode() && document.getElementById("task-status-modal")) closeBoard();
});
window.addEventListener("space-tab:task-statuses-restored", () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingStatusFields.clear();
  pendingTaskFields.clear();
  pendingLinkFields.clear();
  pendingResponsibleFields.clear();
  sprintEditor = null;
  taskDraft = null;
  document.querySelector("#task-status-detail")?.remove();
  board = loadTaskBoard();
  if (selectedStatusId && !board.statuses.some((status) => status.id === selectedStatusId)) selectedStatusId = "";
  renderLauncher();
  scheduleReminder();
  if (document.getElementById("task-status-modal")) renderBoardContent();
});

window.addEventListener("storage", (event) => {
  if (event.key === COLLAPSED_SPRINTS_KEY) {
    collapsedSprints.clear();
    loadCollapsedSprints().forEach((id) => collapsedSprints.add(id));
    if (document.getElementById("task-status-modal")) renderBoardContent();
    return;
  }
  if (event.key !== TASK_STATUS_STORAGE_KEY) return;
  const incoming = loadTaskBoard();

  if (saveTimer) {
    const localStatuses = new Map(board.statuses.map((status) => [status.id, status]));
    const localDraft = taskDraft ? {
      ...taskDraft,
      links: taskDraft.links.map((link) => ({ ...link })),
      responsibles: taskDraft.responsibles.map((responsible) => ({ ...responsible }))
    } : null;
    board = incoming;
    pendingStatusFields.forEach((entry) => {
      const separatorIndex = entry.lastIndexOf(":");
      const statusId = entry.slice(0, separatorIndex);
      const field = entry.slice(separatorIndex + 1);
      const localStatus = localStatuses.get(statusId);
      const incomingStatus = board.statuses.find((status) => status.id === statusId);
      if (localStatus && incomingStatus) incomingStatus[field] = localStatus[field];
    });
    if (localDraft) {
      const incomingTask = getTask(localDraft.id);
      if (incomingTask) {
        const mergedDraft = {
          ...incomingTask,
          links: incomingTask.links.map((link) => ({ ...link })),
          responsibles: incomingTask.responsibles.map((responsible) => ({ ...responsible }))
        };
        pendingTaskFields.forEach((field) => {
          mergedDraft[field] = localDraft[field];
        });
        pendingLinkFields.forEach((entry) => {
          const separatorIndex = entry.lastIndexOf(":");
          const linkId = entry.slice(0, separatorIndex);
          const field = entry.slice(separatorIndex + 1);
          const localLink = localDraft.links.find((link) => link.id === linkId);
          const incomingLink = mergedDraft.links.find((link) => link.id === linkId);
          if (localLink && incomingLink) incomingLink[field] = localLink[field];
        });
        pendingResponsibleFields.forEach((entry) => {
          const separatorIndex = entry.lastIndexOf(":");
          const responsibleId = entry.slice(0, separatorIndex);
          const field = entry.slice(separatorIndex + 1);
          const localResponsible = localDraft.responsibles.find((responsible) => responsible.id === responsibleId);
          const incomingResponsible = mergedDraft.responsibles.find((responsible) => responsible.id === responsibleId);
          if (localResponsible && incomingResponsible) incomingResponsible[field] = localResponsible[field];
        });
        taskDraft = mergedDraft;
        Object.assign(incomingTask, mergedDraft);
      } else {
        taskDraft = null;
        pendingTaskFields.clear();
        pendingLinkFields.clear();
        pendingResponsibleFields.clear();
        document.querySelector("#task-status-detail")?.remove();
        if (!pendingStatusFields.size) {
          clearTimeout(saveTimer);
          saveTimer = null;
          renderLauncher();
          renderBoardContent();
        }
      }
    }
    return;
  }

  board = incoming;
  if (selectedStatusId && !board.statuses.some((status) => status.id === selectedStatusId)) selectedStatusId = "";
  if (taskDraft) {
    const incomingTask = getTask(taskDraft.id);
    if (incomingTask) {
      taskDraft = {
        ...incomingTask,
        links: incomingTask.links.map((link) => ({ ...link })),
        responsibles: incomingTask.responsibles.map((responsible) => ({ ...responsible }))
      };
    }
    else {
      taskDraft = null;
      document.querySelector("#task-status-detail")?.remove();
    }
  }
  renderLauncher();
  scheduleReminder();
  renderBoardContent();
  if (taskDraft) renderTaskDetail();
});

window.addEventListener("pagehide", flushPendingSave);

window.addEventListener("space-tab:task-statuses-restore-started", (event) => {
  if (saveTimer && !window.confirm("В статусах задач есть несохранённый текст. Заменить его данными из Google Drive?")) {
    event.preventDefault();
    return;
  }
  driveRestoreRunning = true;
  if (document.getElementById("task-status-modal")) closeBoard();
  renderLauncher();
});

window.addEventListener("space-tab:task-statuses-restore-finished", () => {
  driveRestoreRunning = false;
  renderLauncher();
});

window.addEventListener("space-tab:before-task-statuses-restore", (event) => {
  if (!saveTimer) return;
  event.detail.confirmation = window.confirm(
    "В статусах задач есть несохранённый текст. Заменить его данными из Google Drive?"
  );
});

renderLauncher();
scheduleDueRefresh();
scheduleReminder();
initTaskReminderAlerts({ onOpenTasks: openBoard });
