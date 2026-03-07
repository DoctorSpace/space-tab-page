const NOTES_KEY = "notes_data";

const modalState = {
  selectedId: null,
  isCreating: false,
  draftTitle: "",
  draftText: ""
};

function getNotes() {
  try {
    const data = localStorage.getItem(NOTES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
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

function getSortedNotes() {
  return [...getNotes()].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function ensureSelection(notes) {
  if (modalState.isCreating) return;
  if (!notes.length) {
    modalState.selectedId = null;
    return;
  }
  const selectedExists = notes.some((note) => note.id === modalState.selectedId);
  if (!selectedExists) {
    modalState.selectedId = notes[0].id;
  }
}

function getSnippet(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 64) return clean;
  return `${clean.slice(0, 64)}...`;
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

  const pendingCount = getNotes().filter((note) => !note.done).length;

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
      ${pendingCount > 0 ? `<span class="notes-btn__badge">${pendingCount}</span>` : ""}
    </button>
  `;

  const button = document.getElementById("notes-btn");
  if (button) button.addEventListener("click", openNotesModal);
}

function renderMiniList(notes) {
  if (!notes.length) {
    return '<div class="notes-mini__empty">Пока пусто. Создайте первую заметку.</div>';
  }

  return notes
    .map((note) => {
      const selectedClass = note.id === modalState.selectedId && !modalState.isCreating ? "notes-mini__item--active" : "";
      return `
        <article class="notes-mini__item ${selectedClass}" data-id="${note.id}">
          <button class="notes-mini__select" data-action="select" data-id="${note.id}" title="Открыть полностью">
            <div class="notes-mini__title">${escapeHtml(getDisplayTitle(note))}</div>
            <div class="notes-mini__text">${escapeHtml(getSnippet(note.text))}</div>
            <div class="notes-mini__meta">
              <span>${formatDate(note.createdAt)}</span>
              ${note.done ? '<span class="notes-mini__status">Готово</span>' : ""}
            </div>
          </button>
          <div class="notes-mini__tools">
            <button class="notes-mini__tool" data-action="toggle" data-id="${note.id}" title="Переключить статус">${note.done ? "↺" : "✓"}</button>
            <button class="notes-mini__tool notes-mini__tool--delete" data-action="delete" data-id="${note.id}" title="Удалить">×</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEditor(notes) {
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
    : notes.find((note) => note.id === modalState.selectedId);

  if (!current) {
    return `
      <div class="notes-editor__empty">
        <p>Заметка не найдена.</p>
      </div>
    `;
  }

  const primaryLabel = modalState.isCreating ? "Добавить" : "Сохранить";
  const secondaryLabel = modalState.isCreating ? "Отмена" : "Новая";
  const doneClass = current.done ? "notes-editor__chip--done" : "";

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
          <p>${formatDate(current.createdAt)}</p>
        </div>
        ${!modalState.isCreating ? `<span class="notes-editor__chip ${doneClass}">${current.done ? "Выполнено" : "В работе"}</span>` : ""}
      </div>

      <textarea
        id="notes-editor-input"
        class="notes-editor__input"
        placeholder="Пишите здесь..."
      >${escapeHtml(modalState.draftText)}</textarea>

      <div class="notes-editor__actions">
        <button class="notes-editor__btn" data-action="secondary">${secondaryLabel}</button>
        <button class="notes-editor__btn notes-editor__btn--primary" data-action="save">${primaryLabel}</button>
      </div>
    </div>
  `;
}

function syncDraftFromSelection(notes) {
  if (modalState.isCreating) return;
  const current = notes.find((note) => note.id === modalState.selectedId);
  modalState.draftTitle = current ? String(current.title || "") : "";
  modalState.draftText = current ? current.text : "";
}

function rerenderModal(modal) {
  const notes = getSortedNotes();
  ensureSelection(notes);
  syncDraftFromSelection(notes);

  const miniList = modal.querySelector("#notes-mini-list");
  const editor = modal.querySelector("#notes-editor-panel");
  if (!miniList || !editor) return;

  miniList.innerHTML = renderMiniList(notes);
  editor.innerHTML = renderEditor(notes);

  const input = modal.querySelector("#notes-editor-input");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function addOrUpdateNote() {
  const title = modalState.draftTitle.trim();
  const text = modalState.draftText.trim();
  if (!title && !text) return;

  const notes = getNotes();

  if (modalState.isCreating) {
    const newNote = {
      id: generateId(),
      title,
      text,
      done: false,
      createdAt: Date.now()
    };
    notes.unshift(newNote);
    saveNotes(notes);
    modalState.isCreating = false;
    modalState.selectedId = newNote.id;
    return;
  }

  const note = notes.find((item) => item.id === modalState.selectedId);
  if (!note) return;
  note.title = title;
  note.text = text;
  saveNotes(notes);
}

function toggleNote(id) {
  const notes = getNotes();
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  note.done = !note.done;
  saveNotes(notes);
}

function deleteNote(id) {
  const notes = getNotes().filter((note) => note.id !== id);
  saveNotes(notes);
  if (modalState.selectedId === id) {
    modalState.selectedId = null;
  }
}

function openNotesModal() {
  const existingModal = document.getElementById("notes-modal");
  if (existingModal) existingModal.remove();

  modalState.isCreating = false;
  modalState.selectedId = getSortedNotes()[0]?.id || null;
  modalState.draftTitle = "";
  modalState.draftText = "";

  const modal = document.createElement("div");
  modal.id = "notes-modal";
  modal.className = "notes-modal";
  modal.innerHTML = `
    <div class="notes-modal__overlay"></div>
    <section class="notes-modal__content" role="dialog" aria-modal="true" aria-label="Заметки">
      <header class="notes-modal__header">
        <div>
          <h2>Заметки</h2>
          <p>Слева кратко, справа полностью.</p>
        </div>
        <button class="notes-modal__close" id="notes-modal-close" aria-label="Закрыть">×</button>
      </header>

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
    modal.remove();
    document.body.style.overflow = "";
    renderNotesButton();
    document.removeEventListener("keydown", escHandler);
  };

  const escHandler = (event) => {
    if (event.key === "Escape") closeModal();
  };

  modal.querySelector(".notes-modal__overlay")?.addEventListener("click", closeModal);
  modal.querySelector("#notes-modal-close")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", escHandler);

  modal.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    if (action === "new") {
      modalState.isCreating = true;
      modalState.selectedId = null;
      modalState.draftTitle = "";
      modalState.draftText = "";
      rerenderModal(modal);
      return;
    }

    if (action === "select" && id) {
      modalState.isCreating = false;
      modalState.selectedId = id;
      const selected = getNotes().find((note) => note.id === id);
      modalState.draftTitle = selected ? String(selected.title || "") : "";
      modalState.draftText = selected ? selected.text : "";
      rerenderModal(modal);
      return;
    }

    if (action === "toggle" && id) {
      toggleNote(id);
      rerenderModal(modal);
      return;
    }

    if (action === "delete" && id) {
      deleteNote(id);
      rerenderModal(modal);
      return;
    }

    if (action === "secondary") {
      if (modalState.isCreating) {
        modalState.isCreating = false;
      } else {
        modalState.isCreating = true;
        modalState.selectedId = null;
      }
      modalState.draftTitle = "";
      modalState.draftText = "";
      rerenderModal(modal);
      return;
    }

    if (action === "save") {
      addOrUpdateNote();
      rerenderModal(modal);
    }
  });

  modal.addEventListener("input", (event) => {
    const titleInput = event.target.closest("#notes-editor-title");
    if (titleInput) {
      modalState.draftTitle = titleInput.value;
      return;
    }

    const input = event.target.closest("#notes-editor-input");
    if (!input) return;
    modalState.draftText = input.value;
  });

  modal.addEventListener("keydown", (event) => {
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initNotes());
} else {
  initNotes();
}

window.addEventListener("space-tab:notes-restored", () => {
  renderNotesButton();
});
