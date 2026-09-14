const REMINDER_ALERT_KEY = "space_tab_task_daily_reminder_alert_v1";
const REMINDER_DISMISSED_KEY = "space_tab_task_daily_reminder_dismissed_v1";

let openTasks = () => {};
let testTimer = null;

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bellSvg() {
  return `
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6.5 16.5h11l-1.3-2.1V10a4.2 4.2 0 0 0-8.4 0v4.4l-1.3 2.1ZM10 19h4"/>
    </svg>
  `;
}

function getStoredAlert() {
  try {
    const raw = localStorage.getItem(REMINDER_ALERT_KEY);
    const alert = raw ? JSON.parse(raw) : null;
    return alert && typeof alert === "object" && alert.id ? alert : null;
  } catch {
    return null;
  }
}

function updateTestButton(pending) {
  const button = document.querySelector('[data-action="test-reminder"]');
  if (!button) return;
  button.disabled = pending;
  button.textContent = pending ? "Сработает через 5 сек..." : "Тест через 5 сек.";
}

function renderAlert(alert) {
  if (!alert) return;
  document.getElementById("task-daily-reminder")?.remove();
  const isTest = alert.type === "test";
  const reminder = document.createElement("aside");
  reminder.id = "task-daily-reminder";
  reminder.className = "task-daily-reminder";
  reminder.innerHTML = `
    <span class="task-daily-reminder__icon">${bellSvg()}</span>
    <div class="task-daily-reminder__text">
      <strong>${isTest ? "Тестовое напоминание" : "Обновите статус задач"}</strong>
      <span>${isTest ? "Напоминание о заполнении статуса задач работает" : `Укажите, что было сделано сегодня. Без записи: ${Number(alert.missingCount) || 0}`}</span>
    </div>
    <button class="task-daily-reminder__open" type="button">Открыть задачи</button>
    <button class="task-daily-reminder__close" type="button" aria-label="Закрыть">×</button>
  `;
  reminder.querySelector(".task-daily-reminder__open")?.addEventListener("click", () => openTasks());
  reminder.querySelector(".task-daily-reminder__close")?.addEventListener("click", () => {
    if (alert.type === "daily") localStorage.setItem(REMINDER_DISMISSED_KEY, localDateStamp());
    localStorage.removeItem(REMINDER_ALERT_KEY);
    reminder.remove();
  });
  document.body.appendChild(reminder);
}

function handleStoredAlert() {
  clearTimeout(testTimer);
  testTimer = null;
  const alert = getStoredAlert();
  if (!alert) {
    document.getElementById("task-daily-reminder")?.remove();
    updateTestButton(false);
    return;
  }

  if (alert.type === "test-pending") {
    document.getElementById("task-daily-reminder")?.remove();
    updateTestButton(true);
    testTimer = setTimeout(() => {
      const currentAlert = getStoredAlert();
      if (!currentAlert || currentAlert.id !== alert.id || currentAlert.type !== "test-pending") return;
      const testAlert = { ...currentAlert, type: "test", createdAt: currentAlert.triggerAt };
      localStorage.setItem(REMINDER_ALERT_KEY, JSON.stringify(testAlert));
      renderAlert(testAlert);
      updateTestButton(false);
    }, Math.max(0, Number(alert.triggerAt) - Date.now()));
    return;
  }

  renderAlert(alert);
  updateTestButton(false);
}

export function publishTaskReminder(missingCount) {
  const storedAlert = getStoredAlert();
  if (storedAlert) {
    handleStoredAlert();
    return;
  }
  const now = new Date();
  if (localStorage.getItem(REMINDER_DISMISSED_KEY) === localDateStamp(now)) return;

  const alert = {
    id: `reminder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: "daily",
    date: localDateStamp(now),
    createdAt: Date.now(),
    missingCount: Number(missingCount) || 0
  };
  localStorage.setItem(REMINDER_ALERT_KEY, JSON.stringify(alert));
  handleStoredAlert();
}

export function scheduleTaskReminderTest() {
  const storedAlert = getStoredAlert();
  if (storedAlert) {
    handleStoredAlert();
    return;
  }

  const pendingAlert = {
    id: `reminder-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: "test-pending",
    triggerAt: Date.now() + 5000
  };
  localStorage.setItem(REMINDER_ALERT_KEY, JSON.stringify(pendingAlert));
  handleStoredAlert();
}

export function isTaskReminderTestPending() {
  return getStoredAlert()?.type === "test-pending";
}

export function initTaskReminderAlerts({ onOpenTasks } = {}) {
  if (typeof onOpenTasks === "function") openTasks = onOpenTasks;
  window.addEventListener("storage", (event) => {
    if (event.key === REMINDER_ALERT_KEY) handleStoredAlert();
  });
  handleStoredAlert();
}
