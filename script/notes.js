const NOTES_KEY = "notes_data";
const NOTES_GROUPS_KEY = "notes_groups_v1";
const NOTES_GROUP_ORDER_KEY = "notes_group_order_v1";
const ALL_GROUPS_ID = "__all__";
const COMPLETED_ID = "__completed__";

const modalState = {
  selectedId: null,
  selectedGroupId: ALL_GROUPS_ID,
  isCreating: false,
  draftNoteId: null,
  draftTitle: "",
  draftText: "",
  draftGroupId: "",
  draftDueDate: "",
  isManagingGroups: false,
  isAddingGroup: false,
  groupNameDraft: "",
  expandedCompletedGroups: new Set(),
  isPreviewing: false,
  isFullscreen: false,
  editorSelection: null
};

const groupDragState = {
  draggedId: null,
  changed: false,
  initialOrder: [],
  originAction: "",
  ignoreClickUntil: 0,
  pointerId: null,
  pointerTimer: null,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDragging: false,
  pointerScrolled: false
};

const noteDragState = {
  draggedId: null,
  changed: false,
  initialOrder: [],
  container: null,
  originAction: "",
  ignoreClickUntil: 0,
  pointerId: null,
  pointerTimer: null,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerDragging: false,
  pointerScrolled: false
};

let dueDateRefreshTimer = null;

function getNotes() {
  try {
    const data = localStorage.getItem(NOTES_KEY);
    const notes = data ? JSON.parse(data) : [];
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

function getGroups() {
  try {
    const data = localStorage.getItem(NOTES_GROUPS_KEY);
    const groups = data ? JSON.parse(data) : [];
    if (!Array.isArray(groups)) return [];

    const seenIds = new Set();
    return groups.filter((group) => {
      const id = String(group?.id || "").trim();
      const name = String(group?.name || "").trim();
      if (!id || !name || id === ALL_GROUPS_ID || id === COMPLETED_ID || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  } catch {
    return [];
  }
}

function getGroupOrder(groups = getGroups()) {
  const defaultOrder = [ALL_GROUPS_ID, COMPLETED_ID, ...groups.map((group) => String(group.id))];
  try {
    const data = localStorage.getItem(NOTES_GROUP_ORDER_KEY);
    const savedOrder = data ? JSON.parse(data) : [];
    if (!Array.isArray(savedOrder)) return defaultOrder;

    const validIds = new Set(defaultOrder);
    const seenIds = new Set();
    const order = [];
    savedOrder.forEach((value) => {
      const id = String(value);
      if (!validIds.has(id) || seenIds.has(id)) return;
      seenIds.add(id);
      order.push(id);
    });
    defaultOrder.forEach((id) => {
      if (!seenIds.has(id)) order.push(id);
    });
    return order;
  } catch {
    return defaultOrder;
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent("space-tab:notes-updated"));
  } catch {}
}

function saveGroups(groups) {
  try {
    localStorage.setItem(NOTES_GROUPS_KEY, JSON.stringify(groups));
    window.dispatchEvent(new CustomEvent("space-tab:notes-updated"));
  } catch {}
}

function saveGroupOrder(order) {
  try {
    localStorage.setItem(NOTES_GROUP_ORDER_KEY, JSON.stringify(order));
    window.dispatchEvent(new CustomEvent("space-tab:notes-updated"));
  } catch {}
}

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getSortedNotes(notes = getNotes()) {
  return [...notes].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return 0;
  });
}

function normalizeDueDate(value) {
  const dateValue = String(value || "").trim();
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? dateValue
    : "";
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowDateKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function requiresAttention(note, today = getTodayDateKey()) {
  const dueDate = normalizeDueDate(note?.dueDate);
  return Boolean(!note?.done && dueDate && dueDate <= today);
}

function formatDueDate(value) {
  const dueDate = normalizeDueDate(value);
  if (!dueDate) return "";
  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(year !== new Date().getFullYear() ? { year: "numeric" } : {})
  });
}

function formatShortDueDate(value) {
  const dueDate = normalizeDueDate(value);
  if (!dueDate) return "";
  const [, month, day] = dueDate.split("-");
  return `${day}.${month}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function hasId(item, id) {
  return String(item?.id ?? "") === String(id ?? "");
}

function ensureSelection(notes) {
  if (modalState.isCreating) return;
  if (!notes.length) {
    modalState.selectedId = null;
    return;
  }
  const selectedExists = notes.some((note) => hasId(note, modalState.selectedId));
  if (!selectedExists) {
    modalState.selectedId = notes[0].id;
  }
}

function getSnippet(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 64) return clean;
  return `${clean.slice(0, 64)}...`;
}

function getNoteGroupId(note, groups) {
  const groupId = String(note?.groupId || "");
  return groups.some((group) => String(group.id) === groupId) ? groupId : "";
}

function getFilteredNotes(notes, groups) {
  if (modalState.selectedGroupId === ALL_GROUPS_ID) return notes;
  if (modalState.selectedGroupId === COMPLETED_ID) return notes.filter((note) => note.done);
  return notes.filter((note) => getNoteGroupId(note, groups) === modalState.selectedGroupId);
}

function getDefaultGroupId(groups) {
  return groups.some((group) => String(group.id) === modalState.selectedGroupId)
    ? modalState.selectedGroupId
    : "";
}

function hasUnsavedNoteDraft() {
  if (modalState.isCreating) {
    return Boolean(modalState.draftTitle.trim() || modalState.draftText.trim() || modalState.draftDueDate);
  }

  const note = getNotes().find((item) => hasId(item, modalState.selectedId));
  if (!note) return false;
  const groupId = getNoteGroupId(note, getGroups());
  return String(note.title || "") !== modalState.draftTitle
    || String(note.text || "") !== modalState.draftText
    || groupId !== modalState.draftGroupId
    || normalizeDueDate(note.dueDate) !== modalState.draftDueDate;
}

function hasUnsavedDraft() {
  return Boolean(modalState.isAddingGroup && modalState.groupNameDraft.trim()) || hasUnsavedNoteDraft();
}

function showNotesConfirm({ title, message, confirmLabel = "Продолжить", discardLabel = "", danger = false, success = false }) {
  if (document.getElementById("notes-confirm")) return Promise.resolve(false);

  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let closed = false;
    const confirmModal = document.createElement("div");
    confirmModal.id = "notes-confirm";
    confirmModal.className = "notes-confirm";
    confirmModal.innerHTML = `
      <div class="notes-confirm__overlay" data-confirm-action="cancel"></div>
      <section class="notes-confirm__content" role="alertdialog" aria-modal="true" aria-labelledby="notes-confirm-title" aria-describedby="notes-confirm-message">
        <div class="notes-confirm__icon" aria-hidden="true">!</div>
        <h3 id="notes-confirm-title">${escapeHtml(title)}</h3>
        <p id="notes-confirm-message">${escapeHtml(message)}</p>
        <div class="notes-confirm__actions">
          <button class="notes-confirm__btn" data-confirm-action="cancel">Отмена</button>
          <button class="notes-confirm__btn notes-confirm__btn--confirm ${danger ? "notes-confirm__btn--danger" : success ? "notes-confirm__btn--success" : ""}" data-confirm-action="confirm">${escapeHtml(confirmLabel)}</button>
          ${discardLabel ? `<button class="notes-confirm__btn notes-confirm__btn--danger notes-confirm__btn--discard" data-confirm-action="discard">${escapeHtml(discardLabel)}</button>` : ""}
        </div>
      </section>
    `;

    const close = (confirmed) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", keyHandler, true);
      confirmModal.remove();
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
        const buttons = [...confirmModal.querySelectorAll(".notes-confirm__btn")];
        const first = buttons[0];
        const last = buttons.at(-1);
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
      if (action === "confirm") close(true);
      if (action === "discard") close("discard");
    });
    document.addEventListener("keydown", keyHandler, true);
    document.body.appendChild(confirmModal);
    confirmModal.querySelector('.notes-confirm__btn[data-confirm-action="cancel"]')?.focus();
  });
}

async function canDiscardDraft() {
  if (!hasUnsavedDraft()) return true;
  const hasGroupDraft = Boolean(modalState.isAddingGroup && modalState.groupNameDraft.trim());
  const hasNoteDraft = hasUnsavedNoteDraft();
  const decision = await showNotesConfirm({
    title: "Сохранить изменения?",
    message: hasGroupDraft && hasNoteDraft
      ? "Изменения в карточке и новая группа ещё не сохранены. Сохраните их перед следующим действием или продолжите без сохранения."
      : hasGroupDraft
        ? "Новая группа ещё не сохранена. Сохраните её перед следующим действием или продолжите без сохранения."
        : "Изменения в карточке ещё не сохранены. Сохраните их перед следующим действием или продолжите без сохранения.",
    confirmLabel: "Сохранить",
    discardLabel: "Не сохранять изменения"
  });
  if (!decision) return false;
  if (decision === "discard") return true;
  if (hasGroupDraft) addGroup();
  if (hasNoteDraft || hasUnsavedNoteDraft()) addOrUpdateNote();
  return true;
}

function getSafeLinkHref(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderInlineNoteMarkup(text) {
  const value = String(text || "");
  const tokenPattern = /`([^`\n]+)`|\*\*([^\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let result = "";
  let offset = 0;
  let match = tokenPattern.exec(value);

  while (match) {
    result += escapeHtml(value.slice(offset, match.index));
    if (match[1] !== undefined) {
      result += `<code>${escapeHtml(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      result += `<strong>${escapeHtml(match[2])}</strong>`;
    } else {
      const href = getSafeLinkHref(match[4]);
      result += href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[3])}</a>`
        : escapeHtml(match[0]);
    }
    offset = tokenPattern.lastIndex;
    match = tokenPattern.exec(value);
  }

  return result + escapeHtml(value.slice(offset));
}

function renderNotePreview(text) {
  const lines = String(text || "").split("\n");
  const result = [];
  let codeLines = null;
  let codeFence = "";

  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,})/);
    if (fenceMatch && (!codeLines || line.trim() === codeFence)) {
      if (codeLines) {
        result.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
        codeFence = "";
      } else {
        codeLines = [];
        codeFence = fenceMatch[1];
      }
      return;
    }

    if (codeLines) {
      codeLines.push(line);
      return;
    }

    const checklistMatch = line.match(/^\s*-\s+\[([ xX])\]\s*(.*)$/);
    if (checklistMatch) {
      const checked = checklistMatch[1].toLowerCase() === "x";
      result.push(`
        <label class="notes-preview__check ${checked ? "notes-preview__check--done" : ""}">
          <input class="notes-preview__checkbox" type="checkbox" data-line-index="${index}" ${checked ? "checked" : ""} />
          <span>${renderInlineNoteMarkup(checklistMatch[2])}</span>
        </label>
      `);
      return;
    }

    result.push(line.trim()
      ? `<p>${renderInlineNoteMarkup(line)}</p>`
      : '<div class="notes-preview__spacer" aria-hidden="true"></div>');
  });

  if (codeLines) result.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return result.join("");
}

function replaceEditorRange(input, start, end, replacement, selectionStart, selectionEnd = selectionStart) {
  input.setRangeText(replacement, start, end, "end");
  modalState.draftText = input.value;
  input.focus();
  input.setSelectionRange(selectionStart, selectionEnd);
}

function insertChecklist(modal) {
  const input = modal.querySelector("#notes-editor-input");
  if (!input) return;
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const lineStart = selectionStart === 0 ? 0 : input.value.lastIndexOf("\n", selectionStart - 1) + 1;
  const endLookup = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  const nextBreak = input.value.indexOf("\n", endLookup);
  const lineEnd = nextBreak === -1 ? input.value.length : nextBreak;
  const block = input.value.slice(lineStart, lineEnd);
  const replacement = block
    .split("\n")
    .map((line) => /^\s*-\s+\[[ xX]\]/.test(line) ? line : `- [ ] ${line}`)
    .join("\n");
  replaceEditorRange(input, lineStart, lineEnd, replacement, lineStart + replacement.length);
}

function insertLink(modal) {
  const input = modal.querySelector("#notes-editor-input");
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const label = (input.value.slice(start, end) || "текст ссылки").replace(/[\]\n]+/g, " ").trim() || "текст ссылки";
  const url = "https://example.com";
  const replacement = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  replaceEditorRange(input, start, end, replacement, urlStart, urlStart + url.length);
}

function insertCode(modal) {
  const input = modal.querySelector("#notes-editor-input");
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end);
  if (selected.includes("\n") || selected.includes("`")) {
    const longestRun = Math.max(0, ...(selected.match(/`+/g) || []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longestRun + 1));
    const replacement = `${fence}\n${selected || "код"}\n${fence}`;
    replaceEditorRange(input, start, end, replacement, start + fence.length + 1, start + fence.length + 1 + (selected || "код").length);
    return;
  }

  const code = selected || "код";
  const replacement = `\`${code}\``;
  replaceEditorRange(input, start, end, replacement, start + 1, start + 1 + code.length);
}

function insertBold(modal) {
  const input = modal.querySelector("#notes-editor-input");
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end);
  const isInsideBold = start >= 2
    && input.value.slice(start - 2, start) === "**"
    && input.value.slice(end, end + 2) === "**";
  if (isInsideBold) {
    replaceEditorRange(input, start - 2, end + 2, selected, start - 2, end - 2);
    return;
  }

  const selectedLines = selected.split("\n");
  const allLinesAreBold = selectedLines.some(Boolean)
    && selectedLines.every((line) => !line || (line.startsWith("**") && line.endsWith("**") && line.length > 4));
  if (allLinesAreBold) {
    const replacement = selectedLines
      .map((line) => line ? line.slice(2, -2) : line)
      .join("\n");
    replaceEditorRange(input, start, end, replacement, start, start + replacement.length);
    return;
  }
  if (selected.includes("**")) return;

  const text = selected || "жирный текст";
  const replacement = text
    .split("\n")
    .map((line) => line ? `**${line}**` : line)
    .join("\n");
  const selectionStart = selected.includes("\n") ? start : start + 2;
  const selectionEnd = selected.includes("\n") ? start + replacement.length : selectionStart + text.length;
  replaceEditorRange(input, start, end, replacement, selectionStart, selectionEnd);
}

function applyFullscreenState(modal) {
  modal.classList.toggle("notes-modal--editor-fullscreen", modalState.isFullscreen);
  const button = modal.querySelector('[data-action="toggle-fullscreen"]');
  if (!button) return;
  const label = modalState.isFullscreen ? "Выйти из фокус-режима" : "Открыть в фокус-режиме";
  button.classList.toggle("notes-editor__tool--active", modalState.isFullscreen);
  button.setAttribute("aria-pressed", String(modalState.isFullscreen));
  button.setAttribute("aria-label", label);
  button.title = label;
}

function applyPreviewState(modal) {
  const input = modal.querySelector("#notes-editor-input");
  const preview = modal.querySelector("#notes-editor-preview");
  if (!input || !preview) return;

  input.hidden = modalState.isPreviewing;
  preview.hidden = !modalState.isPreviewing;
  if (modalState.isPreviewing) {
    preview.innerHTML = modalState.draftText.trim()
      ? renderNotePreview(modalState.draftText)
      : '<div class="notes-preview__empty">Добавьте текст, чекбоксы, ссылки или код.</div>';
  }

  ["insert-checklist", "insert-link", "insert-code", "insert-bold"].forEach((action) => {
    const button = modal.querySelector(`[data-action="${action}"]`);
    if (button) button.disabled = modalState.isPreviewing;
  });
  const previewButton = modal.querySelector('[data-action="toggle-preview"]');
  if (previewButton) {
    previewButton.classList.toggle("notes-editor__tool--active", modalState.isPreviewing);
    previewButton.setAttribute("aria-pressed", String(modalState.isPreviewing));
    previewButton.textContent = modalState.isPreviewing ? "Редактор" : "Просмотр";
  }

  if (!modalState.isPreviewing) {
    input.focus();
    if (modalState.editorSelection) {
      input.setSelectionRange(modalState.editorSelection.start, modalState.editorSelection.end);
      modalState.editorSelection = null;
    }
  }
}

function updateDueDateControl(modal) {
  const control = modal.querySelector(".notes-editor__due");
  const input = modal.querySelector("#notes-editor-due-date");
  const calendarButton = modal.querySelector(".notes-editor__due-calendar");
  const dateChip = modal.querySelector("#notes-editor-due-chip");
  if (!control || !input || !calendarButton) return;
  input.value = modalState.draftDueDate;
  const currentNote = getNotes().find((note) => hasId(note, modalState.selectedId));
  const isDone = modalState.isCreating ? false : Boolean(currentNote?.done);
  const isTomorrow = Boolean(!isDone && modalState.draftDueDate === getTomorrowDateKey());
  const dueRequiresAttention = Boolean(
    !isDone && modalState.draftDueDate && modalState.draftDueDate <= getTodayDateKey()
  );
  control.classList.toggle("notes-editor__due--scheduled", Boolean(modalState.draftDueDate));
  control.classList.toggle("notes-editor__due--tomorrow", isTomorrow);
  control.classList.toggle("notes-editor__due--attention", dueRequiresAttention);
  const ariaLabel = modalState.draftDueDate
    ? `Срок: ${formatDueDate(modalState.draftDueDate)}`
    : "Выбрать дату";
  const title = modalState.draftDueDate ? "Изменить срок" : "Выбрать дату";
  calendarButton.title = title;
  input.title = title;
  input.setAttribute("aria-label", ariaLabel);
  if (dateChip) {
    dateChip.hidden = !modalState.draftDueDate;
    dateChip.textContent = formatShortDueDate(modalState.draftDueDate);
    dateChip.title = modalState.draftDueDate ? ariaLabel : "";
    dateChip.classList.toggle("notes-editor__chip--tomorrow", isTomorrow);
    dateChip.classList.toggle("notes-editor__chip--attention", dueRequiresAttention);
  }
}

function getDisplayTitle(note) {
  const title = String(note?.title || "").trim();
  if (title) return title;
  const snippet = getSnippet(String(note?.text || ""));
  return snippet || "Без названия";
}

function renderNotesButton() {
  const container = document.getElementById("notes");
  if (!container) return;

  const attentionCount = getNotes().filter((note) => requiresAttention(note)).length;

  container.innerHTML = `
    <button class="notes-btn" id="notes-btn" aria-label="Открыть заметки">
      <span class="notes-btn__row">
        <span class="notes-btn__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 6.5h8M8 10h8M8 13.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" stroke="currentColor" stroke-width="1.4"/>
          </svg>
        </span>
        <span class="notes-btn__title">Заметки</span>
      </span>
      ${attentionCount > 0 ? `<span class="notes-btn__badge" title="Требуют внимания">${attentionCount}</span>` : ""}
    </button>
  `;

  const button = document.getElementById("notes-btn");
  if (button) button.addEventListener("click", openNotesModal);
}

function refreshDueDateIndicators() {
  renderNotesButton();
  const modal = document.getElementById("notes-modal");
  if (!modal) return;
  const allNotes = getSortedNotes();
  const groups = getGroups();
  const notes = getFilteredNotes(allNotes, groups);
  const groupSwitcher = modal.querySelector("#notes-groups");
  const miniList = modal.querySelector("#notes-mini-list");
  if (groupSwitcher) groupSwitcher.innerHTML = renderGroupSwitcher(allNotes, groups);
  if (miniList) miniList.innerHTML = renderMiniList(notes);
  updateDueDateControl(modal);
}

function scheduleDueDateRefresh() {
  clearTimeout(dueDateRefreshTimer);
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  dueDateRefreshTimer = setTimeout(() => {
    refreshDueDateIndicators();
    scheduleDueDateRefresh();
  }, nextDay.getTime() - now.getTime());
}

function renderGroupSwitcher(notes, groups) {
  const groupButton = (id, name, count, canDelete = false, attentionCount = 0, tomorrowCount = 0) => {
    const isActive = modalState.selectedGroupId === id;
    const activeClass = isActive ? "notes-groups__item--active" : "";
    const canDeleteActiveGroup = modalState.isManagingGroups && canDelete && isActive;
    const deletableClass = canDeleteActiveGroup ? "notes-groups__item--deletable" : "";
    return `
      <div class="notes-groups__item ${activeClass} ${deletableClass}" draggable="true" data-group-order-id="${escapeHtml(id)}">
        <button class="notes-groups__select" data-action="select-group" data-group-id="${escapeHtml(id)}">
          <span>${escapeHtml(name)}</span>
          <span class="notes-groups__count">
            <span>${count}</span>
            ${attentionCount > 0 ? `<span class="notes-groups__attention" title="Требуют внимания">${attentionCount}</span>` : ""}
            ${tomorrowCount > 0 ? `<span class="notes-groups__tomorrow" title="Срок завтра">${tomorrowCount}</span>` : ""}
          </span>
        </button>
        ${canDeleteActiveGroup ? `<button class="notes-groups__delete" data-action="delete-group" data-group-id="${escapeHtml(id)}" aria-label="Удалить группу ${escapeHtml(name)}" title="Удалить группу">×</button>` : ""}
      </div>
    `;
  };

  const attentionNotes = notes.filter((note) => requiresAttention(note));
  const tomorrowDate = getTomorrowDateKey();
  const tomorrowNotes = notes.filter((note) => !note.done && normalizeDueDate(note.dueDate) === tomorrowDate);
  const groupById = new Map(groups.map((group) => [String(group.id), group]));
  const orderedGroupItems = getGroupOrder(groups)
    .map((id) => {
      if (id === ALL_GROUPS_ID) return groupButton(id, "Все", notes.length);
      if (id === COMPLETED_ID) return groupButton(id, "Выполненные", notes.filter((note) => note.done).length);
      const group = groupById.get(id);
      if (!group) return "";
      const count = notes.filter((note) => getNoteGroupId(note, groups) === id).length;
      const attentionCount = attentionNotes.filter((note) => getNoteGroupId(note, groups) === id).length;
      const tomorrowCount = tomorrowNotes.filter((note) => getNoteGroupId(note, groups) === id).length;
      return groupButton(id, String(group.name), count, true, attentionCount, tomorrowCount);
    })
    .join("");

  return `
    <div class="notes-groups__list">
      ${orderedGroupItems}
      ${modalState.isManagingGroups ? `<button class="notes-groups__add-toggle" data-action="toggle-group-form" aria-label="Добавить группу" title="Добавить группу">+ Группа</button>` : ""}
      ${modalState.isManagingGroups && modalState.isAddingGroup ? `
        <div class="notes-groups__form">
          <input id="notes-group-name" maxlength="48" placeholder="Название группы" value="${escapeHtml(modalState.groupNameDraft)}" />
          <button data-action="add-group" aria-label="Сохранить группу" title="Сохранить">✓</button>
        </div>
      ` : ""}
    </div>
    <button class="notes-groups__settings ${modalState.isManagingGroups ? "notes-groups__settings--active" : ""}" data-action="toggle-group-settings" aria-label="Настройки групп" title="Настройки групп" aria-pressed="${modalState.isManagingGroups}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h7M15 7h5M4 17h5M13 17h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        <circle cx="13" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/>
        <circle cx="11" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/>
      </svg>
    </button>
  `;
}

function renderMiniItems(notes) {
  const today = getTodayDateKey();
  const tomorrow = getTomorrowDateKey();
  return notes
    .map((note) => {
      const selectedClass = hasId(note, modalState.selectedId) && !modalState.isCreating ? "notes-mini__item--active" : "";
      const dateLabel = note.updatedAt ? `Изменено ${formatDate(note.updatedAt)}` : formatDate(note.createdAt);
      const dueDate = normalizeDueDate(note.dueDate);
      const dueLabel = dueDate
        ? note.done
          ? formatDueDate(dueDate)
          : dueDate === today
          ? "Сегодня"
          : dueDate < today ? `Просрочено · ${formatDueDate(dueDate)}` : formatDueDate(dueDate)
        : "";
      const dueClass = requiresAttention(note, today)
        ? "notes-mini__due--attention"
        : !note.done && dueDate === tomorrow ? "notes-mini__due--tomorrow" : "";
      return `
        <article class="notes-mini__item ${selectedClass}" data-id="${escapeHtml(String(note.id))}" draggable="true">
          <div class="notes-mini__drag-handle" data-action="drag-note" title="Перетащить заметку" aria-hidden="true">
            <svg viewBox="0 0 12 20" aria-hidden="true">
              <circle cx="3" cy="4" r="1.25"/><circle cx="9" cy="4" r="1.25"/>
              <circle cx="3" cy="10" r="1.25"/><circle cx="9" cy="10" r="1.25"/>
              <circle cx="3" cy="16" r="1.25"/><circle cx="9" cy="16" r="1.25"/>
            </svg>
          </div>
          <button class="notes-mini__select" data-action="select" data-id="${escapeHtml(String(note.id))}" title="Открыть полностью">
            <div class="notes-mini__title">${escapeHtml(getDisplayTitle(note))}</div>
            <div class="notes-mini__text">${escapeHtml(getSnippet(note.text))}</div>
            <div class="notes-mini__meta">
              <span class="${note.updatedAt ? "notes-mini__edited" : ""}">${dateLabel}</span>
              <span class="notes-mini__meta-tags">
                ${dueDate ? `<span class="notes-mini__due ${dueClass}" title="Срок: ${escapeHtml(formatDueDate(dueDate))}">${escapeHtml(dueLabel)}</span>` : ""}
                ${note.done ? '<span class="notes-mini__status">Готово</span>' : ""}
              </span>
            </div>
          </button>
        </article>
      `;
    })
    .join("");
}

function renderMiniList(notes) {
  if (!notes.length) {
    const message = modalState.selectedGroupId === COMPLETED_ID
      ? "Выполненных задач пока нет."
      : "В этой группе пока нет задач.";
    return `<div class="notes-mini__empty">${message}</div>`;
  }

  if (modalState.selectedGroupId === COMPLETED_ID) return renderMiniItems(notes);

  const pendingNotes = notes.filter((note) => !note.done);
  const completedNotes = notes.filter((note) => note.done);
  const isExpanded = modalState.expandedCompletedGroups.has(modalState.selectedGroupId);
  return `
    ${renderMiniItems(pendingNotes)}
    ${completedNotes.length ? `
      <div class="notes-mini__completed">
        <button class="notes-mini__completed-toggle" data-action="toggle-completed-list" aria-expanded="${isExpanded}">
          <span>Выполненные</span>
          <span class="notes-mini__completed-count">${completedNotes.length}</span>
          <span class="notes-mini__completed-arrow ${isExpanded ? "notes-mini__completed-arrow--open" : ""}" aria-hidden="true">⌄</span>
        </button>
        ${isExpanded ? `<div class="notes-mini__completed-list">${renderMiniItems(completedNotes)}</div>` : ""}
      </div>
    ` : ""}
  `;
}

function renderEditor(notes, groups) {
  if (!notes.length && !modalState.isCreating) {
    return `
      <div class="notes-editor__empty">
        <p>Выберите заметку слева или создайте новую.</p>
        <button class="notes-editor__btn notes-editor__btn--primary" data-action="new">Новая заметка</button>
      </div>
    `;
  }

  const current = modalState.isCreating
    ? { createdAt: Date.now(), done: false, title: modalState.draftTitle, text: modalState.draftText }
    : notes.find((note) => hasId(note, modalState.selectedId));

  if (!current) {
    return `
      <div class="notes-editor__empty">
        <p>Заметка не найдена.</p>
      </div>
    `;
  }

  const primaryLabel = modalState.isCreating ? "Добавить" : "Сохранить";
  const secondaryLabel = "Отмена";
  const dueIsTomorrow = Boolean(!current.done && modalState.draftDueDate === getTomorrowDateKey());
  const dueRequiresAttention = Boolean(
    !current.done && modalState.draftDueDate && modalState.draftDueDate <= getTodayDateKey()
  );
  const dueChipClass = dueRequiresAttention
    ? "notes-editor__chip--attention"
    : dueIsTomorrow ? "notes-editor__chip--tomorrow" : "";
  const formattingDisabled = modalState.isPreviewing ? " disabled" : "";
  const groupOptions = groups
    .map((group) => {
      const id = String(group.id);
      const selected = modalState.draftGroupId === id ? " selected" : "";
      return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(String(group.name))}</option>`;
    })
    .join("");

  return `
    <div class="notes-editor">
      <div class="notes-editor__head">
        <div>
          <input
            id="notes-editor-title"
            class="notes-editor__title-input"
            placeholder="Заголовок заметки"
            value="${escapeHtml(modalState.draftTitle)}"
          />
          <p class="notes-editor__dates">
            <span>Создано ${formatDate(current.createdAt)}</span>
            ${current.updatedAt ? `<span class="notes-editor__edited">Изменено ${formatDate(current.updatedAt)}</span>` : ""}
          </p>
        </div>
        <span id="notes-editor-due-chip" class="notes-editor__chip ${dueChipClass}" title="${modalState.draftDueDate ? `Срок: ${escapeHtml(formatDueDate(modalState.draftDueDate))}` : ""}" ${modalState.draftDueDate ? "" : "hidden"}>${escapeHtml(formatShortDueDate(modalState.draftDueDate))}</span>
      </div>

      <textarea
        id="notes-editor-input"
        class="notes-editor__input"
        placeholder="Пишите здесь..."
        ${modalState.isPreviewing ? "hidden" : ""}
      >${escapeHtml(modalState.draftText)}</textarea>
      <div class="notes-preview" id="notes-editor-preview" ${modalState.isPreviewing ? "" : "hidden"}>
        ${modalState.draftText.trim() ? renderNotePreview(modalState.draftText) : '<div class="notes-preview__empty">Добавьте текст, чекбоксы, ссылки или код.</div>'}
      </div>

      <div class="notes-editor__actions">
        <div class="notes-editor__actions-controls">
          <label class="notes-editor__group">
            <span>Группа</span>
            <select id="notes-editor-group">
              <option value="">Группа не выбрана</option>
              ${groupOptions}
            </select>
          </label>
          <div class="notes-editor__due ${modalState.draftDueDate ? "notes-editor__due--scheduled" : ""} ${dueIsTomorrow ? "notes-editor__due--tomorrow" : ""} ${dueRequiresAttention ? "notes-editor__due--attention" : ""}">
            <button class="notes-editor__due-calendar" type="button" data-action="pick-due-date" title="${modalState.draftDueDate ? "Изменить срок" : "Выбрать дату"}" aria-hidden="true" tabindex="-1">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v3M17 3.5v3M4.5 9h15M6.5 5h11a2 2 0 012 2v11a2 2 0 01-2 2h-11a2 2 0 01-2-2V7a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            </button>
            <input id="notes-editor-due-date" type="date" value="${escapeHtml(modalState.draftDueDate)}" title="${modalState.draftDueDate ? "Изменить срок" : "Выбрать дату"}" aria-label="${modalState.draftDueDate ? `Срок: ${escapeHtml(formatDueDate(modalState.draftDueDate))}` : "Выбрать дату"}" />
          </div>
          <div class="notes-editor__toolbar" role="toolbar" aria-label="Форматирование заметки">
            <div class="notes-editor__toolbar-group">
              <button class="notes-editor__tool notes-editor__tool--icon" data-action="insert-checklist" title="Добавить чекбокс" aria-label="Добавить чекбокс"${formattingDisabled}>
                <span aria-hidden="true">☐</span>
              </button>
              <button class="notes-editor__tool notes-editor__tool--icon" data-action="insert-link" title="Вставить ссылку" aria-label="Вставить ссылку"${formattingDisabled}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5l5-5M8 16H6.5a4.5 4.5 0 010-9H10m4 0h3.5a4.5 4.5 0 010 9H14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
              <button class="notes-editor__tool notes-editor__tool--icon" data-action="insert-code" title="Оформить как код" aria-label="Оформить как код"${formattingDisabled}>
                <span aria-hidden="true">&lt;/&gt;</span>
              </button>
              <button class="notes-editor__tool notes-editor__tool--icon notes-editor__tool--bold" data-action="insert-bold" title="Жирный текст" aria-label="Жирный текст"${formattingDisabled}>
                <span aria-hidden="true">B</span>
              </button>
            </div>
            <div class="notes-editor__toolbar-group notes-editor__toolbar-group--view">
              <button class="notes-editor__tool notes-editor__tool--preview ${modalState.isPreviewing ? "notes-editor__tool--active" : ""}" data-action="toggle-preview" aria-pressed="${modalState.isPreviewing}">
                ${modalState.isPreviewing ? "Редактор" : "Просмотр"}
              </button>
              <button class="notes-editor__tool notes-editor__tool--icon ${modalState.isFullscreen ? "notes-editor__tool--active" : ""}" data-action="toggle-fullscreen" aria-pressed="${modalState.isFullscreen}" title="${modalState.isFullscreen ? "Выйти из фокус-режима" : "Открыть в фокус-режиме"}" aria-label="${modalState.isFullscreen ? "Выйти из фокус-режима" : "Открыть в фокус-режиме"}">
                <span aria-hidden="true">⛶</span>
              </button>
            </div>
          </div>
        </div>
        <div class="notes-editor__actions-buttons">
          ${modalState.isCreating ? `
            <button class="notes-editor__btn notes-editor__btn--icon" data-action="secondary" title="${secondaryLabel}" aria-label="${secondaryLabel}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
            </button>
          ` : ""}
          ${!modalState.isCreating ? `
            <button class="notes-editor__btn notes-editor__btn--icon notes-editor__btn--complete" data-action="toggle" data-id="${escapeHtml(String(current.id))}" title="${current.done ? "Вернуть в работу" : "Завершить"}" aria-label="${current.done ? "Вернуть заметку в работу" : "Завершить заметку"}">
              ${current.done
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8H4V4M4.7 8a8 8 0 111.2 9.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
            </button>
            <button class="notes-editor__btn notes-editor__btn--icon notes-editor__btn--delete" data-action="delete" data-id="${escapeHtml(String(current.id))}" title="Удалить заметку" aria-label="Удалить заметку">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8v9M12 8v9M16 8v9M5 5h14M9 5V3.5h6V5m2.5 0l-.7 15H7.2L6.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          ` : ""}
          <button class="notes-editor__btn notes-editor__btn--icon notes-editor__btn--primary" data-action="save" title="${primaryLabel}" aria-label="${primaryLabel}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5V4zm3 0v6h8V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function syncDraftFromSelection(notes, groups) {
  if (modalState.isCreating) return;
  const current = notes.find((note) => hasId(note, modalState.selectedId));
  if (current && hasId(current, modalState.draftNoteId)) return;
  modalState.draftTitle = current ? String(current.title || "") : "";
  modalState.draftText = current ? String(current.text || "") : "";
  modalState.draftGroupId = current ? getNoteGroupId(current, groups) : "";
  modalState.draftDueDate = current ? normalizeDueDate(current.dueDate) : "";
  modalState.draftNoteId = current?.id ?? null;
}

function rerenderModal(modal) {
  applyFullscreenState(modal);
  const allNotes = getSortedNotes();
  const groups = getGroups();
  const selectedGroupExists = groups.some((group) => String(group.id) === modalState.selectedGroupId);
  const isSpecialGroup = modalState.selectedGroupId === ALL_GROUPS_ID
    || modalState.selectedGroupId === COMPLETED_ID;
  if (!isSpecialGroup && !selectedGroupExists) {
    modalState.selectedGroupId = ALL_GROUPS_ID;
  }
  const notes = getFilteredNotes(allNotes, groups);
  const showCompleted = modalState.selectedGroupId === COMPLETED_ID
    || modalState.expandedCompletedGroups.has(modalState.selectedGroupId);
  const visibleNotes = showCompleted ? notes : notes.filter((note) => !note.done);
  ensureSelection(visibleNotes);
  syncDraftFromSelection(visibleNotes, groups);

  const groupSwitcher = modal.querySelector("#notes-groups");
  const miniList = modal.querySelector("#notes-mini-list");
  const editor = modal.querySelector("#notes-editor-panel");
  if (!groupSwitcher || !miniList || !editor) return;

  groupSwitcher.innerHTML = renderGroupSwitcher(allNotes, groups);
  miniList.innerHTML = renderMiniList(notes);
  editor.innerHTML = renderEditor(visibleNotes, groups);
  applyFullscreenState(modal);

  const input = modal.querySelector(modalState.isAddingGroup
    ? "#notes-group-name"
    : modalState.isPreviewing ? "#notes-editor-preview" : "#notes-editor-input");
  if (input) {
    if (typeof input.focus === "function") input.focus();
    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function addOrUpdateNote() {
  const title = modalState.draftTitle.trim();
  const text = modalState.draftText;
  if (modalState.isCreating && !title && !text.trim() && !modalState.draftDueDate) return;

  const notes = getNotes();
  const groups = getGroups();
  const groupId = groups.some((group) => String(group.id) === modalState.draftGroupId)
    ? modalState.draftGroupId
    : "";

  if (modalState.isCreating) {
    const newNote = {
      id: generateId(),
      title,
      text,
      done: false,
      createdAt: Date.now(),
      groupId,
      dueDate: modalState.draftDueDate
    };
    notes.unshift(newNote);
    saveNotes(notes);
    modalState.isCreating = false;
    modalState.selectedId = newNote.id;
    if (modalState.selectedGroupId === COMPLETED_ID) {
      modalState.selectedGroupId = groupId || ALL_GROUPS_ID;
    }
    return;
  }

  const note = notes.find((item) => hasId(item, modalState.selectedId));
  if (!note) return;
  const changed = String(note.title || "") !== title
    || String(note.text || "") !== text
    || getNoteGroupId(note, groups) !== groupId
    || normalizeDueDate(note.dueDate) !== modalState.draftDueDate;
  note.title = title;
  note.text = text;
  note.groupId = groupId;
  note.dueDate = modalState.draftDueDate;
  if (changed) note.updatedAt = Date.now();
  modalState.draftTitle = title;
  modalState.draftText = text;
  saveNotes(notes);
  if (modalState.selectedGroupId !== ALL_GROUPS_ID && modalState.selectedGroupId !== COMPLETED_ID) {
    const destinationGroupId = groupId || ALL_GROUPS_ID;
    modalState.selectedGroupId = destinationGroupId;
    if (note.done) modalState.expandedCompletedGroups.add(destinationGroupId);
  }
}

function addGroup() {
  const name = modalState.groupNameDraft.trim();
  if (!name) return;

  const groups = getGroups();
  const hasOpenDraft = modalState.isCreating || modalState.selectedId !== null;
  const existing = groups.find((group) => String(group.name).toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"));
  if (existing) {
    if (hasOpenDraft) {
      modalState.draftGroupId = String(existing.id);
    } else {
      modalState.selectedGroupId = String(existing.id);
    }
    modalState.isAddingGroup = false;
    modalState.groupNameDraft = "";
    return;
  }

  const group = { id: generateId(), name, createdAt: Date.now() };
  groups.push(group);
  saveGroups(groups);
  saveGroupOrder(getGroupOrder(groups));
  if (hasOpenDraft) {
    modalState.draftGroupId = group.id;
  } else {
    modalState.selectedGroupId = group.id;
  }
  modalState.isAddingGroup = false;
  modalState.groupNameDraft = "";
}

async function deleteGroup(id) {
  const groups = getGroups();
  const group = groups.find((item) => String(item.id) === id);
  if (!group) return false;
  const confirmed = await showNotesConfirm({
    title: "Удалить группу?",
    message: `Задачи из группы «${group.name}» останутся во вкладке «Все».`,
    confirmLabel: "Удалить",
    danger: true
  });
  if (!confirmed) return false;

  const notes = getNotes();
  const updatedAt = Date.now();
  notes.forEach((note) => {
    if (String(note?.groupId || "") === id) {
      note.groupId = "";
      note.updatedAt = updatedAt;
    }
  });
  saveGroupOrder(getGroupOrder(groups).filter((groupId) => groupId !== id));
  saveGroups(groups.filter((item) => String(item.id) !== id));
  saveNotes(notes);
  modalState.expandedCompletedGroups.delete(id);
  modalState.selectedGroupId = ALL_GROUPS_ID;
  modalState.selectedId = null;
  modalState.isCreating = false;
  modalState.draftNoteId = null;
  return true;
}

function toggleNote(id) {
  const notes = getNotes();
  const note = notes.find((item) => hasId(item, id));
  if (!note) return;
  note.done = !note.done;
  saveNotes(notes);
  if (!note.done && modalState.selectedGroupId === COMPLETED_ID) {
    modalState.selectedGroupId = getNoteGroupId(note, getGroups()) || ALL_GROUPS_ID;
  }
}

function deleteNote(id) {
  const notes = getNotes().filter((note) => !hasId(note, id));
  saveNotes(notes);
  if (hasId({ id: modalState.selectedId }, id)) {
    modalState.selectedId = null;
  }
}

function saveRenderedNoteOrder(renderedIds) {
  const notes = getNotes();
  const notesById = new Map(notes.map((note) => [String(note.id), note]));
  const orderedNotes = renderedIds.map((id) => notesById.get(String(id))).filter(Boolean);
  const orderedIds = new Set(orderedNotes.map((note) => String(note.id)));
  let orderedIndex = 0;

  const reorderedNotes = notes.map((note) => {
    if (!orderedIds.has(String(note.id))) return note;
    return orderedNotes[orderedIndex++];
  });
  saveNotes(reorderedNotes);
}

function openNotesModal() {
  const existingModal = document.getElementById("notes-modal");
  if (existingModal) existingModal.remove();

  modalState.isCreating = false;
  modalState.selectedId = null;
  modalState.selectedGroupId = getGroupOrder()[0] || ALL_GROUPS_ID;
  modalState.draftNoteId = null;
  modalState.draftTitle = "";
  modalState.draftText = "";
  modalState.draftGroupId = "";
  modalState.draftDueDate = "";
  modalState.isManagingGroups = false;
  modalState.isAddingGroup = false;
  modalState.groupNameDraft = "";
  modalState.expandedCompletedGroups.clear();
  modalState.isPreviewing = true;
  modalState.isFullscreen = false;
  modalState.editorSelection = null;

  const modal = document.createElement("div");
  modal.id = "notes-modal";
  modal.className = "notes-modal";
  modal.innerHTML = `
    <div class="notes-modal__overlay"></div>
    <section class="notes-modal__content" role="dialog" aria-modal="true" aria-label="Заметки">
      <header class="notes-modal__header">
        <div>
          <h2>Заметки</h2>
        </div>
        <button class="notes-modal__close" id="notes-modal-close" aria-label="Закрыть">×</button>
      </header>
      <nav class="notes-groups" id="notes-groups" aria-label="Группы задач"></nav>

      <div class="notes-modal__body">
        <aside class="notes-mini">
          <button class="notes-mini__new" data-action="new">+ Новая заметка</button>
          <div class="notes-mini__list" id="notes-mini-list"></div>
        </aside>
        <main class="notes-editor-panel" id="notes-editor-panel"></main>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  const closeModal = () => {
    clearTimeout(groupDragState.pointerTimer);
    clearTimeout(noteDragState.pointerTimer);
    finishGroupDrag(false);
    finishNoteDrag(false);
    groupDragState.pointerTimer = null;
    groupDragState.pointerId = null;
    noteDragState.pointerTimer = null;
    noteDragState.pointerId = null;
    modal.remove();
    document.body.style.overflow = "";
    renderNotesButton();
    document.removeEventListener("keydown", escHandler);
  };

  const requestCloseModal = async () => {
    if (await canDiscardDraft()) closeModal();
  };

  const escHandler = (event) => {
    if (event.key !== "Escape" || document.getElementById("notes-confirm")) return;
    if (modalState.isFullscreen) {
      modalState.isFullscreen = false;
      applyFullscreenState(modal);
      return;
    }
    requestCloseModal();
  };

  modal.querySelector(".notes-modal__overlay")?.addEventListener("click", requestCloseModal);
  modal.querySelector("#notes-modal-close")?.addEventListener("click", requestCloseModal);
  document.addEventListener("keydown", escHandler);

  const getRenderedGroupOrder = () => [...modal.querySelectorAll(".notes-groups__item[data-group-order-id]")]
    .map((item) => item.dataset.groupOrderId)
    .filter(Boolean);

  const beginGroupDrag = (item) => {
    groupDragState.draggedId = item.dataset.groupOrderId;
    groupDragState.initialOrder = getRenderedGroupOrder();
    groupDragState.changed = false;
    item.classList.add("notes-groups__item--dragging");
  };

  const moveGroupItem = (list, clientX) => {
    const items = [...list.querySelectorAll(".notes-groups__item[data-group-order-id]")];
    const draggedItem = items.find((item) => item.dataset.groupOrderId === groupDragState.draggedId);
    if (!draggedItem) return;
    const remainingItems = items.filter((item) => item !== draggedItem);
    const beforeItem = remainingItems.find((item) => {
      const rect = item.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    const addButton = list.querySelector('[data-action="toggle-group-form"]');
    list.insertBefore(draggedItem, beforeItem || addButton || null);
    groupDragState.changed = getRenderedGroupOrder().some((id, index) => id !== groupDragState.initialOrder[index]);

    const listRect = list.getBoundingClientRect();
    if (clientX < listRect.left + 36) list.scrollLeft -= 12;
    if (clientX > listRect.right - 36) list.scrollLeft += 12;
  };

  const finishGroupDrag = (commit = false) => {
    if (!groupDragState.draggedId) return;
    const draggedItem = modal.querySelector(".notes-groups__item--dragging");
    draggedItem?.classList.remove("notes-groups__item--dragging");
    if (commit && groupDragState.changed) {
      saveGroupOrder(getRenderedGroupOrder());
      groupDragState.ignoreClickUntil = Date.now() + 350;
    } else if (!commit && groupDragState.changed) {
      const list = modal.querySelector(".notes-groups__list");
      const addButton = list?.querySelector('[data-action="toggle-group-form"]');
      groupDragState.initialOrder.forEach((id) => {
        const item = [...(list?.querySelectorAll(".notes-groups__item[data-group-order-id]") || [])]
          .find((groupItem) => groupItem.dataset.groupOrderId === id);
        if (item) list.insertBefore(item, addButton || null);
      });
    }
    groupDragState.draggedId = null;
    groupDragState.changed = false;
    groupDragState.initialOrder = [];
    groupDragState.pointerDragging = false;
  };

  const getNoteItems = (container) => [...(container?.children || [])]
    .filter((item) => item.matches?.(".notes-mini__item[data-id]"));

  const getRenderedNoteOrder = (container) => getNoteItems(container)
    .map((item) => item.dataset.id)
    .filter(Boolean);

  const beginNoteDrag = (item) => {
    noteDragState.draggedId = item.dataset.id;
    noteDragState.container = item.parentElement;
    noteDragState.initialOrder = getRenderedNoteOrder(noteDragState.container);
    noteDragState.changed = false;
    item.classList.add("notes-mini__item--dragging");
  };

  const moveNoteItem = (clientY) => {
    const container = noteDragState.container;
    const items = getNoteItems(container);
    const draggedItem = items.find((item) => item.dataset.id === noteDragState.draggedId);
    if (!draggedItem) return;

    const beforeItem = items
      .filter((item) => item !== draggedItem)
      .find((item) => {
        const rect = item.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
    const completedBlock = container?.id === "notes-mini-list"
      ? [...container.children].find((item) => item.matches?.(".notes-mini__completed"))
      : null;
    container.insertBefore(draggedItem, beforeItem || completedBlock || null);
    noteDragState.changed = getRenderedNoteOrder(container)
      .some((id, index) => id !== noteDragState.initialOrder[index]);

    const list = modal.querySelector("#notes-mini-list");
    const listRect = list?.getBoundingClientRect();
    if (list && listRect) {
      if (clientY < listRect.top + 44) list.scrollTop -= 14;
      if (clientY > listRect.bottom - 44) list.scrollTop += 14;
    }
  };

  const finishNoteDrag = (commit = false) => {
    if (!noteDragState.draggedId) return;
    const container = noteDragState.container;
    const draggedItem = getNoteItems(container)
      .find((item) => item.dataset.id === noteDragState.draggedId);
    draggedItem?.classList.remove("notes-mini__item--dragging");

    if (commit && noteDragState.changed) {
      saveRenderedNoteOrder(getRenderedNoteOrder(container));
      noteDragState.ignoreClickUntil = Date.now() + 350;
    } else if (!commit && noteDragState.changed) {
      const completedBlock = container?.id === "notes-mini-list"
        ? [...container.children].find((item) => item.matches?.(".notes-mini__completed"))
        : null;
      noteDragState.initialOrder.forEach((id) => {
        const item = getNoteItems(container).find((noteItem) => noteItem.dataset.id === id);
        if (item) container.insertBefore(item, completedBlock || null);
      });
    }

    noteDragState.draggedId = null;
    noteDragState.changed = false;
    noteDragState.initialOrder = [];
    noteDragState.container = null;
    noteDragState.pointerDragging = false;
  };

  modal.addEventListener("pointerdown", (event) => {
    const item = event.target.closest(".notes-groups__item[data-group-order-id]");
    groupDragState.originAction = event.target.closest("[data-action]")?.dataset.action || "";
    if (event.pointerType === "mouse" || !item || groupDragState.originAction === "delete-group") return;

    groupDragState.pointerId = event.pointerId;
    groupDragState.pointerStartX = event.clientX;
    groupDragState.pointerStartY = event.clientY;
    groupDragState.pointerScrolled = false;
    clearTimeout(groupDragState.pointerTimer);
    groupDragState.pointerTimer = setTimeout(() => {
      groupDragState.pointerDragging = true;
      beginGroupDrag(item);
      item.setPointerCapture?.(event.pointerId);
    }, 320);
  });

  modal.addEventListener("pointerdown", (event) => {
    const item = event.target.closest(".notes-mini__item[data-id]");
    noteDragState.originAction = event.target.closest("[data-action]")?.dataset.action || "";
    if (event.pointerType === "mouse" || !item || noteDragState.originAction !== "drag-note") return;

    noteDragState.pointerId = event.pointerId;
    noteDragState.pointerStartX = event.clientX;
    noteDragState.pointerStartY = event.clientY;
    noteDragState.pointerScrolled = false;
    clearTimeout(noteDragState.pointerTimer);
    noteDragState.pointerTimer = setTimeout(() => {
      noteDragState.pointerDragging = true;
      beginNoteDrag(item);
      item.setPointerCapture?.(event.pointerId);
    }, 320);
  });

  modal.addEventListener("pointermove", (event) => {
    if (event.pointerId !== groupDragState.pointerId) return;
    const list = modal.querySelector(".notes-groups__list");
    if (!list) return;
    if (groupDragState.pointerDragging) {
      event.preventDefault();
      moveGroupItem(list, event.clientX);
      return;
    }

    const deltaX = event.clientX - groupDragState.pointerStartX;
    const deltaY = event.clientY - groupDragState.pointerStartY;
    if (Math.abs(deltaX) <= 8 && Math.abs(deltaY) <= 8) return;
    clearTimeout(groupDragState.pointerTimer);
    groupDragState.pointerTimer = null;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
      list.scrollLeft -= deltaX;
      groupDragState.pointerStartX = event.clientX;
      groupDragState.pointerStartY = event.clientY;
      groupDragState.pointerScrolled = true;
    }
  });

  modal.addEventListener("pointermove", (event) => {
    if (event.pointerId !== noteDragState.pointerId) return;
    const list = modal.querySelector("#notes-mini-list");
    if (!list) return;
    if (noteDragState.pointerDragging) {
      event.preventDefault();
      moveNoteItem(event.clientY);
      return;
    }

    const deltaX = event.clientX - noteDragState.pointerStartX;
    const deltaY = event.clientY - noteDragState.pointerStartY;
    if (Math.abs(deltaX) <= 8 && Math.abs(deltaY) <= 8) return;
    clearTimeout(noteDragState.pointerTimer);
    noteDragState.pointerTimer = null;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      event.preventDefault();
      list.scrollTop -= deltaY;
      noteDragState.pointerStartX = event.clientX;
      noteDragState.pointerStartY = event.clientY;
      noteDragState.pointerScrolled = true;
    }
  });

  const finishPointerInteraction = (event, cancelled = false) => {
    if (event.pointerId !== groupDragState.pointerId) return;
    clearTimeout(groupDragState.pointerTimer);
    groupDragState.pointerTimer = null;
    const wasDragging = groupDragState.pointerDragging;
    if (wasDragging) finishGroupDrag(!cancelled);
    if (wasDragging && !cancelled) groupDragState.ignoreClickUntil = Date.now() + 350;
    if (groupDragState.pointerScrolled) groupDragState.ignoreClickUntil = Date.now() + 350;
    groupDragState.pointerId = null;
    groupDragState.pointerDragging = false;
    groupDragState.pointerScrolled = false;
  };
  modal.addEventListener("pointerup", (event) => finishPointerInteraction(event));
  modal.addEventListener("pointercancel", (event) => finishPointerInteraction(event, true));

  const finishNotePointerInteraction = (event, cancelled = false) => {
    if (event.pointerId !== noteDragState.pointerId) return;
    clearTimeout(noteDragState.pointerTimer);
    noteDragState.pointerTimer = null;
    const wasDragging = noteDragState.pointerDragging;
    if (wasDragging) finishNoteDrag(!cancelled);
    if ((wasDragging && !cancelled) || noteDragState.pointerScrolled) {
      noteDragState.ignoreClickUntil = Date.now() + 350;
    }
    noteDragState.pointerId = null;
    noteDragState.pointerDragging = false;
    noteDragState.pointerScrolled = false;
  };
  modal.addEventListener("pointerup", (event) => finishNotePointerInteraction(event));
  modal.addEventListener("pointercancel", (event) => finishNotePointerInteraction(event, true));

  modal.addEventListener("dragstart", (event) => {
    const groupItem = event.target.closest(".notes-groups__item[data-group-order-id]");
    if (groupItem && groupDragState.originAction !== "delete-group") {
      beginGroupDrag(groupItem);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", groupDragState.draggedId);
      }
      return;
    }

    const noteItem = event.target.closest(".notes-mini__item[data-id]");
    if (!noteItem || noteDragState.originAction !== "drag-note") {
      event.preventDefault();
      return;
    }
    beginNoteDrag(noteItem);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", noteDragState.draggedId);
    }
  });

  modal.addEventListener("dragover", (event) => {
    if (groupDragState.draggedId) {
      const list = event.target.closest(".notes-groups__list");
      if (!list) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      moveGroupItem(list, event.clientX);
      return;
    }

    if (!noteDragState.draggedId || !event.target.closest("#notes-mini-list")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    moveNoteItem(event.clientY);
  });

  modal.addEventListener("drop", (event) => {
    if (groupDragState.draggedId) {
      event.preventDefault();
      finishGroupDrag(true);
      return;
    }
    if (noteDragState.draggedId) {
      event.preventDefault();
      finishNoteDrag(true);
    }
  });
  modal.addEventListener("dragend", () => {
    finishGroupDrag(false);
    finishNoteDrag(false);
  });

  modal.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    if (actionEl.closest(".notes-groups__item") && Date.now() < groupDragState.ignoreClickUntil) {
      groupDragState.ignoreClickUntil = 0;
      event.preventDefault();
      return;
    }

    if (actionEl.closest(".notes-mini__item") && Date.now() < noteDragState.ignoreClickUntil) {
      noteDragState.ignoreClickUntil = 0;
      event.preventDefault();
      return;
    }

    if (action === "pick-due-date") {
      const dueDateInput = modal.querySelector("#notes-editor-due-date");
      if (!dueDateInput) return;
      dueDateInput.focus();
      try {
        dueDateInput.showPicker?.();
      } catch {}
      return;
    }

    if (action === "insert-checklist") {
      insertChecklist(modal);
      return;
    }

    if (action === "insert-link") {
      insertLink(modal);
      return;
    }

    if (action === "insert-code") {
      insertCode(modal);
      return;
    }

    if (action === "insert-bold") {
      insertBold(modal);
      return;
    }

    if (action === "toggle-preview") {
      const input = modal.querySelector("#notes-editor-input");
      if (!modalState.isPreviewing && input) {
        modalState.editorSelection = { start: input.selectionStart, end: input.selectionEnd };
      }
      modalState.isPreviewing = !modalState.isPreviewing;
      applyPreviewState(modal);
      return;
    }

    if (action === "toggle-fullscreen") {
      modalState.isFullscreen = !modalState.isFullscreen;
      applyFullscreenState(modal);
      return;
    }

    if (action === "new") {
      if (!await canDiscardDraft()) return;
      modalState.isCreating = true;
      modalState.selectedId = null;
      modalState.draftNoteId = null;
      modalState.draftTitle = "";
      modalState.draftText = "";
      modalState.draftGroupId = getDefaultGroupId(getGroups());
      modalState.draftDueDate = "";
      modalState.isPreviewing = false;
      rerenderModal(modal);
      return;
    }

    if (action === "toggle-group-form") {
      if (modalState.isAddingGroup && modalState.groupNameDraft.trim()) {
        const confirmed = await showNotesConfirm({
          title: "Не сохранять группу?",
          message: "Введенное название группы будет удалено.",
          confirmLabel: "Не сохранять"
        });
        if (!confirmed) return;
      }
      modalState.isAddingGroup = !modalState.isAddingGroup;
      modalState.groupNameDraft = "";
      rerenderModal(modal);
      return;
    }

    if (action === "toggle-group-settings") {
      if (modalState.isManagingGroups && modalState.isAddingGroup && modalState.groupNameDraft.trim()) {
        const confirmed = await showNotesConfirm({
          title: "Закрыть настройки групп?",
          message: "Введённое название новой группы не будет сохранено.",
          confirmLabel: "Закрыть"
        });
        if (!confirmed) return;
      }
      modalState.isManagingGroups = !modalState.isManagingGroups;
      if (!modalState.isManagingGroups) {
        modalState.isAddingGroup = false;
        modalState.groupNameDraft = "";
      }
      rerenderModal(modal);
      return;
    }

    if (action === "toggle-completed-list") {
      const groupId = modalState.selectedGroupId;
      const selectedNote = getNotes().find((note) => hasId(note, modalState.selectedId));
      const isCollapsingSelectedNote = modalState.expandedCompletedGroups.has(groupId) && selectedNote?.done;
      if (isCollapsingSelectedNote && !await canDiscardDraft()) return;
      if (modalState.expandedCompletedGroups.has(groupId)) {
        modalState.expandedCompletedGroups.delete(groupId);
      } else {
        modalState.expandedCompletedGroups.add(groupId);
      }
      rerenderModal(modal);
      return;
    }

    if (action === "add-group") {
      addGroup();
      rerenderModal(modal);
      return;
    }

    if (action === "select-group") {
      const groupId = actionEl.dataset.groupId || ALL_GROUPS_ID;
      if (modalState.selectedGroupId === groupId) return;
      if (!await canDiscardDraft()) return;
      modalState.selectedGroupId = groupId;
      modalState.selectedId = null;
      modalState.isCreating = false;
      modalState.draftNoteId = null;
      modalState.draftTitle = "";
      modalState.draftText = "";
      modalState.draftGroupId = "";
      modalState.draftDueDate = "";
      rerenderModal(modal);
      return;
    }

    if (action === "delete-group") {
      const groupId = actionEl.dataset.groupId;
      if (!await canDiscardDraft()) return;
      if (groupId && await deleteGroup(groupId)) rerenderModal(modal);
      return;
    }

    if (action === "select" && id) {
      if (!modalState.isCreating && hasId({ id: modalState.selectedId }, id)) return;
      if (!await canDiscardDraft()) return;
      modalState.isCreating = false;
      modalState.selectedId = id;
      modalState.draftNoteId = id;
      const selected = getNotes().find((note) => hasId(note, id));
      modalState.draftTitle = selected ? String(selected.title || "") : "";
      modalState.draftText = selected ? String(selected.text || "") : "";
      modalState.draftGroupId = selected ? getNoteGroupId(selected, getGroups()) : "";
      modalState.draftDueDate = selected ? normalizeDueDate(selected.dueDate) : "";
      rerenderModal(modal);
      return;
    }

    if (action === "toggle" && id) {
      const note = getNotes().find((item) => hasId(item, id));
      if (!note) return;
      if (!note.done) {
        const confirmed = await showNotesConfirm({
          title: "Завершить задачу?",
          message: "После завершения задача будет перемещена в список выполненных.",
          confirmLabel: "Завершить",
          success: true
        });
        if (!confirmed) return;
        if (hasId(note, modalState.selectedId) && hasUnsavedNoteDraft()) addOrUpdateNote();
        toggleNote(id);
        rerenderModal(modal);
        return;
      }
      if (hasId({ id: modalState.selectedId }, id) && !await canDiscardDraft()) return;
      toggleNote(id);
      rerenderModal(modal);
      return;
    }

    if (action === "delete" && id) {
      const note = getNotes().find((item) => hasId(item, id));
      if (!note) return;
      const hasUnsavedChanges = hasId(note, modalState.selectedId) && hasUnsavedNoteDraft();
      const confirmed = await showNotesConfirm({
        title: "Удалить заметку?",
        message: hasUnsavedChanges
          ? "Заметка и все несохранённые изменения будут удалены без возможности восстановления."
          : `Заметка «${getDisplayTitle(note)}» будет удалена без возможности восстановления.`,
        confirmLabel: "Удалить",
        danger: true
      });
      if (!confirmed) return;
      deleteNote(id);
      rerenderModal(modal);
      return;
    }

    if (action === "secondary") {
      if (!await canDiscardDraft()) return;
      if (modalState.isCreating) {
        modalState.isCreating = false;
      } else {
        modalState.isCreating = true;
        modalState.selectedId = null;
      }
      modalState.draftNoteId = null;
      modalState.draftTitle = "";
      modalState.draftText = "";
      modalState.draftGroupId = modalState.isCreating ? getDefaultGroupId(getGroups()) : "";
      modalState.draftDueDate = "";
      modalState.isPreviewing = false;
      rerenderModal(modal);
      return;
    }

    if (action === "save") {
      addOrUpdateNote();
      rerenderModal(modal);
    }
  });

  modal.addEventListener("input", (event) => {
    const dueDateInput = event.target.closest("#notes-editor-due-date");
    if (dueDateInput) {
      modalState.draftDueDate = normalizeDueDate(dueDateInput.value);
      updateDueDateControl(modal);
      return;
    }

    const groupNameInput = event.target.closest("#notes-group-name");
    if (groupNameInput) {
      modalState.groupNameDraft = groupNameInput.value;
      return;
    }

    const groupSelect = event.target.closest("#notes-editor-group");
    if (groupSelect) {
      modalState.draftGroupId = groupSelect.value;
      return;
    }

    const titleInput = event.target.closest("#notes-editor-title");
    if (titleInput) {
      modalState.draftTitle = titleInput.value;
      return;
    }

    const input = event.target.closest("#notes-editor-input");
    if (!input) return;
    modalState.draftText = input.value;
  });

  modal.addEventListener("paste", (event) => {
    const input = event.target.closest("#notes-editor-input");
    if (!input || input.selectionStart === input.selectionEnd) return;

    const clipboardText = (event.clipboardData?.getData("text/plain") || "").trim();
    const href = getSafeLinkHref(clipboardText);
    if (!href) return;

    event.preventDefault();
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const label = input.value.slice(start, end).replace(/[\]\n]+/g, " ").trim() || "ссылка";
    const replacement = `[${label}](${href})`;
    replaceEditorRange(input, start, end, replacement, start + replacement.length);
  });

  modal.addEventListener("change", (event) => {
    const dueDateInput = event.target.closest("#notes-editor-due-date");
    if (dueDateInput) {
      modalState.draftDueDate = normalizeDueDate(dueDateInput.value);
      updateDueDateControl(modal);
      return;
    }

    const checkbox = event.target.closest(".notes-preview__checkbox");
    if (!checkbox) return;
    const lineIndex = Number(checkbox.dataset.lineIndex);
    const lines = modalState.draftText.split("\n");
    if (!Number.isInteger(lineIndex) || !lines[lineIndex]) return;
    lines[lineIndex] = lines[lineIndex].replace(
      /^(\s*-\s+\[)[ xX](\])/,
      `$1${checkbox.checked ? "x" : " "}$2`
    );
    modalState.draftText = lines.join("\n");
    const input = modal.querySelector("#notes-editor-input");
    if (input) input.value = modalState.draftText;
    applyPreviewState(modal);
  });

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.closest("#notes-group-name")) {
      event.preventDefault();
      addGroup();
      rerenderModal(modal);
      return;
    }

    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      addOrUpdateNote();
      rerenderModal(modal);
    }
  });

  rerenderModal(modal);
}

export function initNotes() {
  const container = document.getElementById("notes");
  if (!container) {
    console.warn("Notes container not found");
    return;
  }

  renderNotesButton();
  scheduleDueDateRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initNotes());
} else {
  initNotes();
}

window.addEventListener("space-tab:notes-restored", () => {
  renderNotesButton();
  const modal = document.getElementById("notes-modal");
  if (modal) {
    modalState.isCreating = false;
    modalState.selectedId = null;
    modalState.selectedGroupId = getGroupOrder()[0] || ALL_GROUPS_ID;
    modalState.draftNoteId = null;
    modalState.draftTitle = "";
    modalState.draftText = "";
    modalState.draftGroupId = "";
    modalState.draftDueDate = "";
    modalState.isManagingGroups = false;
    modalState.isAddingGroup = false;
    modalState.groupNameDraft = "";
    modalState.expandedCompletedGroups.clear();
    modalState.isPreviewing = false;
    modalState.editorSelection = null;
    rerenderModal(modal);
  }
});

window.addEventListener("space-tab:notes-updated", renderNotesButton);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshDueDateIndicators();
});
window.addEventListener("pageshow", refreshDueDateIndicators);

window.addEventListener("space-tab:before-notes-restore", (event) => {
  if (document.getElementById("notes-confirm") && event.detail) {
    event.detail.confirmation = Promise.resolve(false);
  } else if (document.getElementById("notes-modal") && hasUnsavedDraft() && event.detail) {
    event.detail.confirmation = canDiscardDraft();
  }
});
