export const TASK_STATUS_STORAGE_KEY = "space_tab_task_statuses_v1";

const DEFAULT_STATUSES = [
  { id: "in-progress", name: "В работе", color: "#3ba7ff", icon: "play", description: "Задачи, которые уже взяты в работу" },
  { id: "hold", name: "Hold", color: "#ffbd4a", icon: "clock", description: "Задачи, ожидающие решения или материалов" },
  { id: "testing", name: "Тестирование", color: "#9878ff", icon: "flask", description: "Задачи на проверке и тестировании" },
  { id: "review", name: "На ревью", color: "#32d391", icon: "eye", description: "Задачи, ожидающие ревью" }
];

const STATUS_ICONS = new Set([
  "play",
  "clock",
  "flask",
  "eye",
  "pause",
  "block",
  "check",
  "alert",
  "rocket",
  "bug",
  "target",
  "branch",
  "user",
  "star"
]);
const TASK_MARKER_ICONS = new Set([
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
]);
const DEFAULT_RESPONSIBLE_ROLES = ["Аналитик", "QA", "Бекенд"];

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeColor(value, fallback = "#3ba7ff") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function safeDate(value) {
  const date = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return parsed.getFullYear() === Number(match[1])
    && parsed.getMonth() === Number(match[2]) - 1
    && parsed.getDate() === Number(match[3])
    ? date
    : "";
}

function safeTime(value) {
  const time = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "18:00";
}

function sanitizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      id: String(link?.id || createId("link")),
      label: String(link?.label || "").slice(0, 80),
      url: String(link?.url || "").slice(0, 2000)
    }));
}

function sanitizeResponsibles(responsibles) {
  if (!Array.isArray(responsibles)) return [];
  return responsibles.map((responsible) => ({
    id: String(responsible?.id || createId("responsible")),
    role: String(responsible?.role || "").slice(0, 80),
    name: String(responsible?.name || "").slice(0, 160)
  }));
}

function getTrackerUrl(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  return /^(ONBL|WBF)-[0-9]+$/.test(normalizedCode)
    ? `https://tracker.wb.ru/i/DBOUL/${normalizedCode}`
    : "";
}

function isGeneratedTrackerUrl(url) {
  return /^https:\/\/tracker\.wb\.ru\/(?:issue|i\/DBOUL)\/(ONBL|WBF)-[0-9]+\/?$/i.test(String(url || "").trim());
}

export function createDefaultTaskBoard() {
  return {
    version: 8,
    statuses: DEFAULT_STATUSES.map((status) => ({ ...status })),
    tasks: [],
    reminder: {
      enabled: true,
      time: "18:00",
      weekdays: [1, 2, 3, 4, 5]
    }
  };
}

export function sanitizeTaskBoard(value) {
  const fallback = createDefaultTaskBoard();
  if (!value || typeof value !== "object") return fallback;

  const seenStatusIds = new Set();
  const statuses = (Array.isArray(value.statuses) ? value.statuses : [])
    .map((status, index) => {
      const id = String(status?.id || createId("status"));
      if (seenStatusIds.has(id)) return null;
      seenStatusIds.add(id);
      return {
        id,
        name: String(status?.name || `Статус ${index + 1}`).slice(0, 60),
        color: safeColor(status?.color),
        icon: STATUS_ICONS.has(status?.icon) ? status.icon : "clock",
        description: String(status?.description || "").slice(0, 300)
      };
    })
    .filter(Boolean);

  if (!statuses.length) statuses.push(...fallback.statuses);

  const statusIds = new Set(statuses.map((status) => status.id));
  const seenTaskIds = new Set();
  const tasks = (Array.isArray(value.tasks) ? value.tasks : [])
    .map((task) => {
      const id = String(task?.id || createId("task"));
      if (seenTaskIds.has(id)) return null;
      seenTaskIds.add(id);
      return {
        id,
        code: String(task?.code || "").slice(0, 50),
        title: String(task?.title || "Без названия").slice(0, 240),
        description: String(task?.description || "").slice(0, 12000),
        dailyUpdate: String(task?.dailyUpdate || "").slice(0, 12000),
        dailyUpdateDate: safeDate(task?.dailyUpdateDate),
        dueDate: safeDate(task?.dueDate),
        attention: task?.attention === true,
        markerIcon: TASK_MARKER_ICONS.has(task?.markerIcon) ? task.markerIcon : "document",
        markerColor: safeColor(task?.markerColor, "#75bdf0"),
        statusId: statusIds.has(String(task?.statusId)) ? String(task.statusId) : statuses[0].id,
        parentId: task?.parentId ? String(task.parentId) : "",
        links: sanitizeLinks(task?.links),
        responsibles: sanitizeResponsibles(task?.responsibles),
        createdAt: Number(task?.createdAt) || Date.now(),
        updatedAt: Number(task?.updatedAt) || Date.now()
      };
    })
    .filter(Boolean);

  const taskIds = new Set(tasks.map((task) => task.id));
  tasks.forEach((task) => {
    if (!taskIds.has(task.parentId) || task.parentId === task.id) task.parentId = "";
  });

  if (Number(value.version) < 3) {
    tasks.forEach((task) => {
      const labels = new Set(task.links.map((link) => link.label.trim().toLocaleLowerCase("ru")));
      ["Tracker", "GitLab"].forEach((label) => {
        if (!labels.has(label.toLocaleLowerCase("ru"))) {
          task.links.push({ id: createId("link"), label, url: "" });
        }
      });
    });
  }

  if (Number(value.version) < 6) {
    tasks.forEach((task) => {
      const hasFeatureBranch = task.links.some((link) => link.label.trim().toLocaleLowerCase("ru") === "фича-ветка");
      if (!hasFeatureBranch) task.links.push({ id: createId("link"), label: "Фича-ветка", url: "" });
    });
  }

  if (Number(value.version) < 7) {
    tasks.forEach((task) => {
      const roles = new Set(task.responsibles.map((responsible) => responsible.role.trim().toLocaleLowerCase("ru")));
      DEFAULT_RESPONSIBLE_ROLES.forEach((role) => {
        if (!roles.has(role.toLocaleLowerCase("ru"))) {
          task.responsibles.push({ id: createId("responsible"), role, name: "" });
        }
      });
    });
  }

  tasks.forEach((task) => {
    const trackerUrl = getTrackerUrl(task.code);
    let trackerLink = task.links.find((link) => link.label.trim().toLocaleLowerCase("ru") === "tracker");
    if (trackerUrl && !trackerLink) {
      trackerLink = { id: createId("link"), label: "Tracker", url: "" };
      task.links.push(trackerLink);
    }
    if (trackerLink && trackerUrl) trackerLink.url = trackerUrl;
    else if (trackerLink && isGeneratedTrackerUrl(trackerLink.url)) trackerLink.url = "";
  });

  return {
    version: 8,
    statuses,
    tasks,
    reminder: {
      enabled: value.reminder?.enabled !== false,
      time: safeTime(value.reminder?.time),
      weekdays: Array.isArray(value.reminder?.weekdays)
        ? [...new Set(value.reminder.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        : [1, 2, 3, 4, 5]
    }
  };
}

export function loadTaskBoard() {
  try {
    const raw = localStorage.getItem(TASK_STATUS_STORAGE_KEY);
    return sanitizeTaskBoard(raw ? JSON.parse(raw) : null);
  } catch {
    return createDefaultTaskBoard();
  }
}

export function saveTaskBoard(board) {
  const safeBoard = sanitizeTaskBoard(board);
  localStorage.setItem(TASK_STATUS_STORAGE_KEY, JSON.stringify(safeBoard));
  window.dispatchEvent(new CustomEvent("space-tab:task-statuses-updated", { detail: { board: safeBoard } }));
  return safeBoard;
}

export function getTaskBoardStateForSync() {
  return loadTaskBoard();
}

export function applyTaskBoardStateFromSync(value) {
  const board = saveTaskBoard(value);
  window.dispatchEvent(new CustomEvent("space-tab:task-statuses-restored", { detail: { board } }));
  return board;
}

export function makeTask(statusId) {
  const now = Date.now();
  return {
    id: createId("task"),
    code: "",
    title: "Новая задача",
    description: "",
    dailyUpdate: "",
    dailyUpdateDate: "",
    dueDate: "",
    attention: false,
    markerIcon: "document",
    markerColor: "#75bdf0",
    statusId,
    parentId: "",
    links: [
      { id: createId("link"), label: "Макет", url: "" },
      { id: createId("link"), label: "Аналитика", url: "" },
      { id: createId("link"), label: "Tracker", url: "" },
      { id: createId("link"), label: "GitLab", url: "" },
      { id: createId("link"), label: "Фича-ветка", url: "" }
    ],
    responsibles: DEFAULT_RESPONSIBLE_ROLES.map((role) => ({ id: createId("responsible"), role, name: "" })),
    createdAt: now,
    updatedAt: now
  };
}

export function makeStatus() {
  return {
    id: createId("status"),
    name: "Новый статус",
    color: "#66b5ff",
    icon: "clock",
    description: ""
  };
}

export function makeTaskLink() {
  return { id: createId("link"), label: "Ссылка", url: "" };
}

export function makeTaskResponsible() {
  return { id: createId("responsible"), role: "Ответственный", name: "" };
}
