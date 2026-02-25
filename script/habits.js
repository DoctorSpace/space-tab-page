export const HABITS_KEY = "habits_tracker_data";
const MIN_DATE = new Date(2025, 0, 1);

const defaultHabits = [
  { id: 1, name: "Спорт", color: "#54acfa" },
  { id: 2, name: "Чтение", color: "#4ade80" },
  { id: 3, name: "Код", color: "#f472b6" },
];

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

function render() {
  const container = document.getElementById("habits-tracker");
  if (!container) return;

  const data = loadData();
  const weeks = getWeeksBack(30);
  const today = getTodayStr();

  let html = `
    <div class="habits__header">
      <h3 class="habits__title">Habits</h3>
      <button class="habits__toggle" id="habits-edit-btn">✎</button>
    </div>
    <div class="habits__grid">
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
                      style="--habit-color: ${habit.color}">
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
                        const d = new Date(week.start + 'T00:00:00');
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
    <div class="habits__edit" id="habits-edit-panel" style="display: none;">
      ${data.habits
        .map(
          (habit) => `
        <div class="habits__edit-row" data-habit-id="${habit.id}">
          <input type="color" value="${habit.color}" class="habits__color" data-field="color">
          <input type="text" value="${habit.name}" class="habits__input" data-field="name">
          <button class="habits__delete">×</button>
        </div>
      `
        )
        .join("")}
      <button class="habits__add" id="habits-add-btn">+ Добавить</button>
    </div>
  `;

  container.innerHTML = html;
  attachMainEvents();
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
      render();
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
    document.body.style.overflow = "";
    document.body.classList.remove("modal-open");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    }
  });
}

function attachMainEvents() {
  const container = document.getElementById("habits-tracker");

  container.querySelectorAll(".habits__check").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.habitId;
      const date = btn.dataset.date;
      const key = `${habitId}_${date}`;
      const data = loadData();
      data.checked[key] = !data.checked[key];
      saveData(data);
      render();
    });
  });

  container.querySelectorAll(".habits__cell:not(.habits__cell--future)").forEach((cell) => {
    cell.addEventListener("click", () => {
      const habitId = parseInt(cell.dataset.habitId);
      currentHabitId = habitId;
      
      const today = new Date();
      currentModalMonth = today.getMonth();
      currentModalYear = today.getFullYear();
      
      renderModal();
    });
  });

  document.getElementById("habits-edit-btn").addEventListener("click", () => {
    const panel = document.getElementById("habits-edit-panel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  container.querySelectorAll(".habits__input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = parseInt(e.target.closest(".habits__edit-row").dataset.habitId);
      const data = loadData();
      const habit = data.habits.find((h) => h.id === id);
      if (habit) {
        habit.name = e.target.value;
        saveData(data);
        render();
      }
    });
  });

  container.querySelectorAll(".habits__color").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = parseInt(e.target.closest(".habits__edit-row").dataset.habitId);
      const data = loadData();
      const habit = data.habits.find((h) => h.id === id);
      if (habit) {
        habit.color = e.target.value;
        saveData(data);
        render();
      }
    });
  });

  container.querySelectorAll(".habits__delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.target.closest(".habits__edit-row").dataset.habitId);
      const data = loadData();
      data.habits = data.habits.filter((h) => h.id !== id);
      saveData(data);
      render();
    });
  });

  document.getElementById("habits-add-btn").addEventListener("click", () => {
    const data = loadData();
    const newId = Math.max(0, ...data.habits.map((h) => h.id)) + 1;
    data.habits.push({ id: newId, name: "Новая", color: "#54acfa" });
    saveData(data);
    render();
  });
}

export function initHabits() {
  render();
}

export function toggleHabits(show) {
  const container = document.getElementById("habits-tracker");
  if (container) {
    container.style.display = show ? "block" : "none";
  }
}
