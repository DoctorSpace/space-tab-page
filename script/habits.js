export const HABITS_KEY = "habits_tracker_data";
const HABITS_COLLAPSED_KEY = "habits_tracker_collapsed";
const MIN_DATE = new Date(2025, 0, 1);

const defaultHabits = [
  { id: 1, name: "Спорт", color: "#54acfa" },
  { id: 2, name: "Чтение", color: "#4ade80" },
  { id: 3, name: "Код", color: "#f472b6" },
];

let habitsDraft = null;

function loadData() {
  try {
    const data = localStorage.getItem(HABITS_KEY);
    return data ? JSON.parse(data) : { habits: defaultHabits, checked: {} };
  } catch {
    return { habits: defaultHabits, checked: {} };
  }
}

function saveData(data) {
  localStorage.setItem(HABITS_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("space-tab:habits-updated"));
}

function isHabitsCollapsed() {
  try {
    return localStorage.getItem(HABITS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setHabitsCollapsed(value) {
  try {
    localStorage.setItem(HABITS_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // ignore localStorage errors
  }
}

function cloneHabits(habits) {
  return habits.map((habit) => ({ ...habit }));
}

function initHabitsDraft() {
  const data = loadData();
  habitsDraft = cloneHabits(data.habits);
}

function renderHabitsEditorModal(modal) {
  const list = modal.querySelector("#habits-editor-list");
  if (!list) return;

  const items = habitsDraft || [];
  list.innerHTML = `
    <div class="habits-editor__rows">
      ${items
        .map(
          (habit) => `
        <div class="habits-editor__row" data-habit-id="${habit.id}">
          <input type="color" value="${habit.color}" class="habits-editor__color" data-field="color" aria-label="Цвет привычки">
          <input type="text" value="${habit.name}" class="habits-editor__input" data-field="name" placeholder="Название привычки">
          <button class="habits-editor__delete" data-action="delete-habit" data-habit-id="${habit.id}" aria-label="Удалить привычку">×</button>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function openHabitsEditorModal() {
  const existing = document.getElementById("habits-editor-modal");
  if (existing) existing.remove();

  initHabitsDraft();

  const modal = document.createElement("div");
  modal.id = "habits-editor-modal";
  modal.className = "habits-editor-modal";
  modal.innerHTML = `
    <div class="habits-editor-modal__overlay"></div>
    <section class="habits-editor-modal__content" role="dialog" aria-modal="true" aria-label="Редактор привычек">
      <header class="habits-editor-modal__header">
        <h2>Редактор привычек</h2>
        <button class="habits-editor-modal__close" data-action="close-editor" aria-label="Закрыть">×</button>
      </header>
      <div class="habits-editor-modal__body" id="habits-editor-list"></div>
      <footer class="habits-editor-modal__footer">
        <button class="habits-editor__btn" data-action="add-habit">+ Добавить</button>
        <button class="habits-editor__btn habits-editor__btn--save" data-action="save-habits">Сохранить</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  const closeModal = () => {
    modal.remove();
    habitsDraft = null;
    const overviewOpen = document
      .getElementById("habits-overview-modal")
      ?.classList.contains("habits-overview-modal--open");
    const habitDetailsOpen = document.getElementById("habits-modal")?.style.display === "flex";

    if (!overviewOpen && !habitDetailsOpen) {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    }
    document.removeEventListener("keydown", escHandler);
  };

  const escHandler = (event) => {
    if (event.key === "Escape") closeModal();
  };

  renderHabitsEditorModal(modal);

  modal.querySelector(".habits-editor-modal__overlay")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", escHandler);

  modal.addEventListener("input", (event) => {
    if (!habitsDraft) return;
    const row = event.target.closest(".habits-editor__row");
    if (!row) return;
    const id = Number(row.dataset.habitId);
    const habit = habitsDraft.find((h) => h.id === id);
    if (!habit) return;

    if (event.target.classList.contains("habits-editor__input")) {
      habit.name = event.target.value;
    }

    if (event.target.classList.contains("habits-editor__color")) {
      habit.color = event.target.value;
    }
  });

  modal.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl || !habitsDraft) return;

    const action = actionEl.dataset.action;

    if (action === "close-editor") {
      closeModal();
      return;
    }

    if (action === "add-habit") {
      const newId = Math.max(0, ...habitsDraft.map((h) => h.id)) + 1;
      habitsDraft.push({ id: newId, name: "Новая", color: "#54acfa" });
      renderHabitsEditorModal(modal);
      return;
    }

    if (action === "delete-habit") {
      const id = Number(actionEl.dataset.habitId);
      habitsDraft = habitsDraft.filter((habit) => habit.id !== id);
      renderHabitsEditorModal(modal);
      return;
    }

    if (action === "save-habits") {
      const data = loadData();
      data.habits = habitsDraft
        .map((habit) => ({
          id: habit.id,
          name: String(habit.name || "").trim() || "Новая",
          color: habit.color || "#54acfa"
        }))
        .filter((habit) => habit.name);
      saveData(data);
      renderMainAndOverview();
      closeModal();
    }
  });
}

function getTodayStr() {
  const now = new Date();
  return formatDate(now);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonday(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function getWeeksBack(weeksCount = 30) {
  const weeks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = getMonday(today);
  current.setDate(current.getDate() - (weeksCount - 1) * 7);

  for (let i = 0; i < weeksCount; i++) {
    weeks.push({
      start: formatDate(current),
    });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function getRecentDates(daysCount) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = daysCount - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    dates.push(formatDate(day));
  }

  return dates;
}

function getCurrentWeekRange() {
  const monday = getMonday(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {
    start: formatDate(monday),
    end: formatDate(sunday)
  };
}

function getVisibleCompactDays(containerWidth) {
  const safeWidth = Number(containerWidth) || 360;
  const horizontalChrome = 58;
  const cellStep = 24;
  return Math.max(7, Math.min(42, Math.floor((safeWidth - horizontalChrome) / cellStep)));
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : "255, 255, 255";
}

function calculateStreak(habitId, data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  
  let d = new Date(MIN_DATE);
  d.setHours(0, 0, 0, 0);
  
  while (d <= today) {
    const dateStr = formatDate(d);
    const key = `${habitId}_${dateStr}`;
    
    if (data.checked[key]) {
      tempStreak++;
      if (d.getTime() === today.getTime() || isYesterday(d, today)) {
        currentStreak = tempStreak;
      }
    } else {
      if (tempStreak > maxStreak) {
        maxStreak = tempStreak;
      }
      if (d < today && !isYesterday(d, today)) {
        currentStreak = 0;
      }
      tempStreak = 0;
    }
    
    d.setDate(d.getDate() + 1);
  }
  
  if (tempStreak > maxStreak) {
    maxStreak = tempStreak;
  }
  
  const todayStr = getTodayStr();
  const todayChecked = data.checked[`${habitId}_${todayStr}`];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);
  const yesterdayChecked = data.checked[`${habitId}_${yesterdayStr}`];
  
  if (!todayChecked && !yesterdayChecked) {
    currentStreak = 0;
  }
  
  return { current: currentStreak, max: maxStreak };
}

function isYesterday(d, today) {
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getTime() === yesterday.getTime();
}

function renderExpandedGrid(data, weeks, today) {
  return `
    <div class="habits__grid habits__grid--expanded">
      ${data.habits
        .map((habit) => {
          const streak = calculateStreak(habit.id, data);
          return `
          <div class="habits__block" data-habit-id="${habit.id}">
            <div class="habits__block-header">
              <span class="habits__block-name" style="color: ${habit.color}">${habit.name}</span>
              <span class="habits__streak ${streak.current > 0 ? "habits__streak--active" : ""}">
                <span class="habits__streak-icon">🔥</span>
                <span class="habits__streak-count">${streak.current}</span>/<span class="habits__streak-max">${streak.max}</span>
              </span>
              <button class="habits__check ${data.checked[`${habit.id}_${today}`] ? "habits__check--done" : ""}"
                      data-habit-id="${habit.id}" data-date="${today}"
                      style="--habit-color: ${habit.color}; --rgb: ${hexToRgb(habit.color)}"
                      title="Отметить сегодня">
                ✓
              </button>
            </div>
            <div class="habits__block-grid">
              ${Array(7)
                .fill(0)
                .map((_, dayIndex) => {
                  return `
                  <div class="habits__row">
                    ${weeks
                      .map((week) => {
                        const d = new Date(week.start + "T00:00:00");
                        d.setDate(d.getDate() + dayIndex);
                        const dateStr = formatDate(d);
                        const isChecked = data.checked[`${habit.id}_${dateStr}`];
                        const isFuture = dateStr > today;
                        return `
                        <div class="habits__cell ${isChecked ? "habits__cell--checked" : ""} ${isFuture ? "habits__cell--future" : ""}"
                             style="--habit-color: ${habit.color}; --rgb: ${hexToRgb(habit.color)}"
                             data-habit-id="${habit.id}"
                             data-date="${dateStr}">
                        </div>
                      `;
                      })
                      .join("")}
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderCompactList(data, today, visibleDaysCount) {
  const recentDates = getRecentDates(visibleDaysCount);
  const currentWeek = getCurrentWeekRange();

  if (!data.habits.length) {
    return '<div class="habits__empty">Добавьте привычку через кнопку редактирования.</div>';
  }

  return `
    <div class="habits__list" role="list">
      ${data.habits
        .map((habit) => {
          const streak = calculateStreak(habit.id, data);
          const isTodayChecked = Boolean(data.checked[`${habit.id}_${today}`]);

          return `
            <article class="habits__item" data-habit-id="${habit.id}" role="listitem">
              <div class="habits__item-head">
                <button class="habits__item-name" data-action="open-habit" data-habit-id="${habit.id}" style="--habit-color: ${habit.color}">
                  ${habit.name}
                </button>
                <span class="habits__item-streak ${streak.current > 0 ? "habits__item-streak--active" : ""}">
                  🔥 ${streak.current}/${streak.max}
                </span>
                <button class="habits__check ${isTodayChecked ? "habits__check--done" : ""}"
                        data-habit-id="${habit.id}"
                        data-date="${today}"
                        style="--habit-color: ${habit.color}; --rgb: ${hexToRgb(habit.color)}"
                        title="Отметить сегодня">
                  ✓
                </button>
              </div>
              <div class="habits__week" role="group" aria-label="Последние дни привычки ${habit.name}">
                ${recentDates
                  .map((dateStr) => {
                    const isChecked = Boolean(data.checked[`${habit.id}_${dateStr}`]);
                    const isFuture = dateStr > today;
                    const isToday = dateStr === today;
                    const isCurrentWeek = dateStr >= currentWeek.start && dateStr <= currentWeek.end;
                    return `
                      <button class="habits__week-cell ${isChecked ? "habits__week-cell--checked" : ""} ${isFuture ? "habits__week-cell--future" : ""} ${isToday ? "habits__week-cell--today" : ""} ${isCurrentWeek ? "habits__week-cell--current-week" : ""}"
                              style="--habit-color: ${habit.color}; --rgb: ${hexToRgb(habit.color)}"
                              data-habit-id="${habit.id}"
                              data-date="${dateStr}"
                              ${isFuture ? "disabled" : ""}
                              title="${dateStr}">
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function setHabitChecked(habitId, date) {
  const key = `${habitId}_${date}`;
  const data = loadData();
  data.checked[key] = !data.checked[key];
  saveData(data);
}

function getTodayHabitsStatus(data, today) {
  const total = data.habits.length;
  const done = data.habits.reduce((acc, habit) => {
    return acc + (data.checked[`${habit.id}_${today}`] ? 1 : 0);
  }, 0);
  const isDone = total === 0 || done >= total;
  return { total, done, isDone };
}

function renderMainAndOverview() {
  render();
  renderOverviewModalContent();
}

function restoreMainListScroll(scrollTop) {
  if (typeof scrollTop !== "number") return;
  requestAnimationFrame(() => {
    const nextList = document.querySelector("#habits-tracker .habits__list");
    if (nextList) {
      nextList.scrollTop = scrollTop;
    }
  });
}

function render() {
  const container = document.getElementById("habits-tracker");
  if (!container) return;

  const data = loadData();
  const today = getTodayStr();
  const isCollapsed = isHabitsCollapsed();
  const visibleDaysCount = getVisibleCompactDays(container.clientWidth);
  const todayStatus = getTodayHabitsStatus(data, today);

  container.classList.toggle("habits-tracker--collapsed", isCollapsed);

  let html = `
    <div class="habits__header">
      <h3 class="habits__title">
        Habits
        <span class="habits__status-icon ${todayStatus.isDone ? "habits__status-icon--done" : ""}" title="${todayStatus.isDone ? "Все активности выполнены" : `Осталось: ${todayStatus.total - todayStatus.done}`}">
          ${todayStatus.isDone ? "Выполнено" : `Осталось: ${Math.max(0, todayStatus.total - todayStatus.done)}`}
        </span>
      </h3>
      <div class="habits__actions">
        <button class="habits__toggle" id="habits-collapse-btn" title="${isCollapsed ? "Развернуть" : "Свернуть"}">${isCollapsed ? "▸" : "▾"}</button>
        <button class="habits__toggle" id="habits-expand-btn" title="Развернуть">⤢</button>
      </div>
    </div>
    ${isCollapsed ? "" : renderCompactList(data, today, visibleDaysCount)}
  `;

  container.innerHTML = html;
  attachMainEvents();
}

function createOverviewModal() {
  if (document.getElementById("habits-overview-modal")) return;

  const modal = document.createElement("div");
  modal.id = "habits-overview-modal";
  modal.className = "habits-overview-modal";
  modal.innerHTML = `
    <div class="habits-overview-modal__overlay" data-action="close-overview"></div>
    <section class="habits-overview-modal__content" role="dialog" aria-modal="true" aria-label="Все привычки">
      <header class="habits-overview-modal__header">
        <h2>Все привычки</h2>
        <div class="habits-overview-modal__actions">
          <button class="habits__toggle habits__toggle--edit-overview" data-action="edit-overview" title="Редактировать">Редактировать</button>
          <button class="habits-overview-modal__close" data-action="close-overview" aria-label="Закрыть">×</button>
        </div>
      </header>
      <div class="habits-overview-modal__body" id="habits-overview-modal-body"></div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    const isCell = event.target.closest(".habits__cell:not(.habits__cell--future)");
    const isCheck = event.target.closest(".habits__check");

    if (actionEl?.dataset.action === "close-overview") {
      closeOverviewModal();
      return;
    }

    if (actionEl?.dataset.action === "edit-overview") {
      openHabitsEditorModal();
      return;
    }

    if (isCheck) {
      event.stopPropagation();
      const habitId = isCheck.dataset.habitId;
      const date = isCheck.dataset.date;
      setHabitChecked(habitId, date);
      renderMainAndOverview();
      return;
    }

    if (isCell) {
      const habitId = Number(isCell.dataset.habitId);
      currentHabitId = habitId;

      const today = new Date();
      currentModalMonth = today.getMonth();
      currentModalYear = today.getFullYear();

      renderModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("habits-modal")?.style.display === "flex") return;
    if (modal.classList.contains("habits-overview-modal--open")) {
      closeOverviewModal();
    }
  });
}

function renderOverviewModalContent() {
  const modal = document.getElementById("habits-overview-modal");
  if (!modal || !modal.classList.contains("habits-overview-modal--open")) return;

  const body = document.getElementById("habits-overview-modal-body");
  if (!body) return;

  const data = loadData();
  const weeks = getWeeksBack(30);
  const today = getTodayStr();

  body.innerHTML = renderExpandedGrid(data, weeks, today);
}

function openOverviewModal() {
  createOverviewModal();
  const modal = document.getElementById("habits-overview-modal");
  if (!modal) return;

  modal.classList.add("habits-overview-modal--open");
  document.body.style.overflow = "hidden";
  document.body.classList.add("modal-open");
  renderOverviewModalContent();
}

function closeOverviewModal() {
  const modal = document.getElementById("habits-overview-modal");
  if (!modal) return;

  modal.classList.remove("habits-overview-modal--open");
  if (document.getElementById("habits-modal")?.style.display === "flex") return;
  document.body.style.overflow = "";
  document.body.classList.remove("modal-open");
}

let currentHabitId = null;
let currentModalMonth = new Date().getMonth();
let currentModalYear = new Date().getFullYear();

function getWeeksForTimeline() {
  const weeks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMonday = getMonday(today);
  const todayMondayStr = formatDate(todayMonday);
  
  let current = getMonday(today);
  current.setDate(current.getDate() - 15 * 7);

  while (current <= today) {
    const currentStr = formatDate(current);
    weeks.push({
      date: new Date(current),
      isCurrent: currentStr === todayMondayStr
    });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function renderModal() {
  let modal = document.getElementById("habits-modal");
  if (!modal) {
    createModal();
    modal = document.getElementById("habits-modal");
  }

  const data = loadData();
  const habit = data.habits.find((h) => h.id === currentHabitId);
  if (!habit) return;

  const title = document.getElementById("habits-modal-title");
  const body = document.getElementById("habits-modal-body");

  title.textContent = habit.name;
  title.style.color = habit.color;

  const weeks = getWeeksForTimeline();
  const todayStr = getTodayStr();
  const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const fullMonthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  const cellWidth = 16;
  const gap = 2;
  const totalCellWidth = cellWidth + gap;

  let monthsHtml = '';
  let lastMonth = -1;
  let lastMonthStart = 0;
  let currentWeekIndex = 0;

  weeks.forEach((week, i) => {
    const month = week.date.getMonth();
    if (week.isCurrent) currentWeekIndex = i;
    
    if (month !== lastMonth) {
      if (lastMonth !== -1) {
        const width = (i - lastMonthStart) * totalCellWidth;
        monthsHtml += `<div class="habits__timeline-month" style="width: ${width}px;">${monthNames[lastMonth]}</div>`;
      }
      lastMonth = month;
      lastMonthStart = i;
    }
  });
  
  if (lastMonth !== -1) {
    const width = (weeks.length - lastMonthStart) * totalCellWidth;
    monthsHtml += `<div class="habits__timeline-month" style="width: ${width}px;">${monthNames[lastMonth]}</div>`;
  }

  const firstDayOfMonth = new Date(currentModalYear, currentModalMonth, 1);
  const lastDayOfMonth = new Date(currentModalYear, currentModalMonth + 1, 0);
  const startDay = getMonday(firstDayOfMonth);
  
  let calendarDays = [];
  let current = new Date(startDay);
  
  for (let i = 0; i < 42; i++) {
    const dateStr = formatDate(current);
    const isCurrentMonth = current.getMonth() === currentModalMonth;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isFuture = current > today;
    const isBeforeMin = current < MIN_DATE;
    const isChecked = data.checked[`${habit.id}_${dateStr}`];
    const isToday = dateStr === todayStr;
    
    calendarDays.push({
      day: current.getDate(),
      date: dateStr,
      isCurrentMonth,
      isFuture,
      isBeforeMin,
      isChecked,
      isToday
    });
    
    current.setDate(current.getDate() + 1);
    
    if (i >= 27 && current.getMonth() !== currentModalMonth) break;
  }

  const streak = calculateStreak(habit.id, data);

  const canGoPrev = currentModalYear > MIN_DATE.getFullYear() || 
                    (currentModalYear === MIN_DATE.getFullYear() && currentModalMonth > MIN_DATE.getMonth());
  const canGoNext = currentModalYear < new Date().getFullYear() || 
                    (currentModalYear === new Date().getFullYear() && currentModalMonth < new Date().getMonth());

  body.innerHTML = `
    <div class="habits__timeline-container">
      <div class="habits__timeline-labels">
        <div class="habits__timeline-label-fixed"></div>
        ${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => `<div class="habits__timeline-label-fixed">${d}</div>`).join("")}
      </div>
      <div class="habits__timeline-scroll" id="habits-timeline-scroll">
        <div class="habits__timeline">
          <div class="habits__timeline-months">
            ${monthsHtml}
          </div>
          <div class="habits__timeline-days">
            ${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
              .map(
                (dayName, dayIndex) => `
              <div class="habits__timeline-row">
                <div class="habits__timeline-cells">
                  ${weeks
                    .map((week) => {
                      const d = new Date(week.date);
                      d.setDate(d.getDate() + dayIndex);
                      const dateStr = formatDate(d);
                      const isChecked = data.checked[`${habit.id}_${dateStr}`];
                      const isToday = dateStr === todayStr;
                      const isFuture = dateStr > todayStr;
                      return `
                      <div class="habits__timeline-cell 
                                 ${isChecked ? "habits__timeline-cell--checked" : ""} 
                                 ${isToday ? "habits__timeline-cell--today" : ""} 
                                 ${isFuture ? "habits__timeline-cell--future" : ""}"
                            style="--habit-color: ${habit.color}">
                      </div>
                    `;
                    })
                    .join("")}
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>
    
    <div class="habits__bottom-section">
      <div class="habits__streak-section">
        <div class="habits__streak-info">
          <div class="habits__streakBadge ${streak.current > 0 ? "habits__streakBadge--active" : ""}">
            <span class="habits__streakBadge-icon">🔥</span>
            <span class="habits__streakBadge-current">${streak.current}</span>
            <span class="habits__streakBadge-label">тек</span>
          </div>
          <div class="habits__streakBadge">
            <span class="habits__streakBadge-icon">🏆</span>
            <span class="habits__streakBadge-max">${streak.max}</span>
            <span class="habits__streakBadge-label">макс</span>
          </div>
        </div>
      </div>
    
      <div class="habits__calendar-wrapper">
        <div class="habits__calendar">
          <div class="habits__calendar-header">
            <button class="habits__calendar-nav ${!canGoPrev ? "habits__calendar-nav--disabled" : ""}" 
                    id="habits-calendar-prev" ${!canGoPrev ? "disabled" : ""}>◀</button>
            <span class="habits__calendar-title">${fullMonthNames[currentModalMonth]} ${currentModalYear}</span>
            <button class="habits__calendar-nav ${!canGoNext ? "habits__calendar-nav--disabled" : ""}" 
                    id="habits-calendar-next" ${!canGoNext ? "disabled" : ""}>▶</button>
          </div>
          <div class="habits__calendar-weekdays">
            ${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => `<div class="habits__calendar-weekday">${d}</div>`).join("")}
          </div>
          <div class="habits__calendar-days">
            ${calendarDays.map(d => `
              <div class="habits__calendar-day 
                          ${!d.isCurrentMonth ? "habits__calendar-day--outside" : ""} 
                          ${d.isChecked ? "habits__calendar-day--checked" : ""} 
                          ${d.isToday ? "habits__calendar-day--today" : ""}
                          ${d.isFuture || d.isBeforeMin ? "habits__calendar-day--disabled" : ""}"
                   style="--habit-color: ${habit.color}"
                   data-date="${d.date}"
                   data-habit-id="${habit.id}">
                ${d.day}
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  body.querySelectorAll(".habits__calendar-day:not(.habits__calendar-day--disabled)").forEach(day => {
    day.addEventListener("click", () => {
      const date = day.dataset.date;
      const habitId = day.dataset.habitId;
      const key = `${habitId}_${date}`;
      const d = loadData();
      d.checked[key] = !d.checked[key];
      saveData(d);
      renderModal();
      renderMainAndOverview();
    });
  });

  document.getElementById("habits-calendar-prev").addEventListener("click", () => {
    if (canGoPrev) {
      currentModalMonth--;
      if (currentModalMonth < 0) {
        currentModalMonth = 11;
        currentModalYear--;
      }
      renderModal();
    }
  });

  document.getElementById("habits-calendar-next").addEventListener("click", () => {
    if (canGoNext) {
      currentModalMonth++;
      if (currentModalMonth > 11) {
        currentModalMonth = 0;
        currentModalYear++;
      }
      renderModal();
    }
  });

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  document.body.classList.add("modal-open");

  const timelineScroll = document.getElementById("habits-timeline-scroll");
  
  const scrollToCurrentWeek = () => {
    const scrollPosition = currentWeekIndex * totalCellWidth - timelineScroll.clientWidth / 2 + totalCellWidth / 2;
    timelineScroll.scrollLeft = Math.max(0, scrollPosition);
  };
  
  setTimeout(scrollToCurrentWeek, 50);
  
  let isDragging = false;
  let startX = 0;
  let scrollLeftPos = 0;
  
  const handleMouseDown = (e) => {
    isDragging = true;
    timelineScroll.style.cursor = "grabbing";
    startX = e.pageX - timelineScroll.getBoundingClientRect().left;
    scrollLeftPos = timelineScroll.scrollLeft;
  };
  
  const handleMouseUp = () => {
    isDragging = false;
    timelineScroll.style.cursor = "grab";
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - timelineScroll.getBoundingClientRect().left;
    const walk = (x - startX) * 1.5;
    timelineScroll.scrollLeft = scrollLeftPos - walk;
  };
  
  timelineScroll.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("mousemove", handleMouseMove);
}

function createModal() {
  const modal = document.createElement("div");
  modal.id = "habits-modal";
  modal.className = "habits__modal";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="habits__modal-content">
      <div class="habits__modal-header">
        <span class="habits__modal-title" id="habits-modal-title"></span>
        <button class="habits__modal-close" id="habits-modal-close">×</button>
      </div>
      <div class="habits__modal-body" id="habits-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("habits-modal-close").addEventListener("click", () => {
    modal.style.display = "none";
    if (!document.getElementById("habits-overview-modal")?.classList.contains("habits-overview-modal--open")) {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      if (!document.getElementById("habits-overview-modal")?.classList.contains("habits-overview-modal--open")) {
        document.body.style.overflow = "";
        document.body.classList.remove("modal-open");
      }
    }
  });
}

function attachMainEvents() {
  const container = document.getElementById("habits-tracker");

  const openHabitDetails = (habitId) => {
    currentHabitId = Number(habitId);
    const today = new Date();
    currentModalMonth = today.getMonth();
    currentModalYear = today.getFullYear();
    renderModal();
  };

  container.querySelectorAll(".habits__check").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentList = container.querySelector(".habits__list");
      const scrollTop = currentList ? currentList.scrollTop : null;
      const habitId = btn.dataset.habitId;
      const date = btn.dataset.date;
      setHabitChecked(habitId, date);
      renderMainAndOverview();
      restoreMainListScroll(scrollTop);
    });
  });

  container.querySelectorAll(".habits__week-cell:not(.habits__week-cell--future)").forEach((cell) => {
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      openHabitDetails(cell.dataset.habitId);
    });
  });

  container.querySelectorAll(".habits__item").forEach((item) => {
    item.addEventListener("click", () => {
      openHabitDetails(item.dataset.habitId);
    });
  });

  container.querySelectorAll('[data-action="open-habit"]').forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      openHabitDetails(button.dataset.habitId);
    });
  });

  document.getElementById("habits-collapse-btn")?.addEventListener("click", () => {
    setHabitsCollapsed(!isHabitsCollapsed());
    render();
  });

  document.getElementById("habits-expand-btn")?.addEventListener("click", () => {
    openOverviewModal();
  });
}

export function initHabits() {
  render();

  if (!window.__habitsResizeBound) {
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        render();
      }, 120);
    });
    window.__habitsResizeBound = true;
  }
}

export function toggleHabits(show) {
  const container = document.getElementById("habits-tracker");
  if (container) {
    container.style.display = show ? "block" : "none";
  }
}
