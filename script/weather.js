const WEATHER_KEY = "weather_cache";
const FORECAST_KEY = "forecast_cache";
const WEATHER_CITY_KEY = "weather_city";
const CACHE_DURATION = 30 * 60 * 1000;

function getWeatherIcon(code) {
  return `https://openweathermap.org/img/wn/${code}@2x.png`;
}

function getCachedWeather(expectedCity) {
  try {
    const cached = localStorage.getItem(WEATHER_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_DURATION) {
      return null;
    }
    if (expectedCity && data.queryCity && data.queryCity.toLowerCase() !== expectedCity.toLowerCase()) {
      return null;
    }
    return data.weather;
  } catch {
    return null;
  }
}

function getCachedForecast() {
  try {
    const cached = localStorage.getItem(FORECAST_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_DURATION) {
      return null;
    }
    return data.forecast;
  } catch {
    return null;
  }
}

function cacheWeather(weather, queryCity) {
  try {
    localStorage.setItem(WEATHER_KEY, JSON.stringify({
      weather,
      queryCity,
      timestamp: Date.now()
    }));
  } catch {}
}

function getSavedCity() {
  try {
    return localStorage.getItem(WEATHER_CITY_KEY) || "Каменск-Шахтинский";
  } catch {
    return "Каменск-Шахтинский";
  }
}

function saveCity(city) {
  try {
    localStorage.setItem(WEATHER_CITY_KEY, city);
  } catch {}
}

function cacheForecast(forecast) {
  try {
    localStorage.setItem(FORECAST_KEY, JSON.stringify({
      forecast,
      timestamp: Date.now()
    }));
  } catch {}
}

async function fetchWeather(city) {
  const apiKey = "ec67a42a350b8dfebc6de31008e7e150";
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=ru&appid=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Город не найден");
  return response.json();
}

async function fetchForecast(lat, lon) {
  const apiKey = "ec67a42a350b8dfebc6de31008e7e150";
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=ru&appid=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Прогноз недоступен");
  return response.json();
}

function formatTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function interpolateForecast(forecastList) {
  const hourlyData = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  
  for (let i = 0; i < 24; i++) {
    const targetTime = new Date(now.getTime() + i * 60 * 60 * 1000);
    const targetTimestamp = Math.floor(targetTime.getTime() / 1000);
    
    let before = null, after = null;
    for (const item of forecastList) {
      if (item.dt <= targetTimestamp) before = item;
      if (item.dt >= targetTimestamp && !after) after = item;
    }
    
    if (!before) before = after;
    if (!after) after = before;
    
    if (before && after) {
      const ratio = before.dt === after.dt ? 0 : 
        (targetTimestamp - before.dt) / (after.dt - before.dt);
      
      hourlyData.push({
        dt: targetTimestamp,
        main: {
          temp: before.main.temp + (after.main.temp - before.main.temp) * ratio
        },
        weather: [ratio < 0.5 ? before.weather[0] : after.weather[0]]
      });
    }
  }
  
  return hourlyData;
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return "Сегодня";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "Завтра";
  }
  return date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
}

function groupForecastByDay(forecastList) {
  const days = {};
  forecastList.forEach(item => {
    const date = new Date(item.dt * 1000).toDateString();
    if (!days[date]) {
      days[date] = [];
    }
    days[date].push(item);
  });
  return Object.values(days);
}

function formatDateTime() {
  const now = new Date();
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  return { time, date };
}

function renderWeather(data, forecastData) {
  const container = document.getElementById("weather");
  if (!container) return;
  
  const temp = Math.round(data.main.temp);
  const feelsLike = Math.round(data.main.feels_like);
  const humidity = data.main.humidity;
  const wind = Math.round(data.wind.speed);
  const description = data.weather[0].description;
  const icon = data.weather[0].icon;
  const city = data.name;
  const { time, date } = formatDateTime();
  
  let hourlyHTML = "";
  if (forecastData && forecastData.list && forecastData.list.length > 0) {
    const hourlyForecast = interpolateForecast(forecastData.list);
    const now = Math.floor(Date.now() / 1000);
    const next3Hours = hourlyForecast
      .filter(hour => hour.dt > now)
      .slice(0, 3);
    
    if (next3Hours.length > 0) {
      hourlyHTML = `
        <div class="weather__hourly">
          ${next3Hours.map(hour => `
            <div class="weather__hour">
              <span class="weather__hour-time">${formatTime(hour.dt)}</span>
              <img src="${getWeatherIcon(hour.weather[0].icon)}" alt="${hour.weather[0].description}" class="weather__hour-icon">
              <span class="weather__hour-temp">${Math.round(hour.main.temp)}°</span>
            </div>
          `).join("")}
        </div>
      `;
    }
  }
  
  container.innerHTML = `
    <div class="weather">
      <div class="weather__datetime">
        <span class="weather__time" id="weather-time">${time}</span>
        <span class="weather__date">${date}</span>
      </div>
      <div class="weather__main">
        <div class="weather__icon">
          <img src="${getWeatherIcon(icon)}" alt="${description}">
        </div>
        <div class="weather__info">
          <div class="weather__location-row">
            <div class="weather__location">${city}</div>
            <button class="weather__city-edit" id="weather-city-edit" title="Изменить город">✎</button>
          </div>
          <div class="weather__temp">${temp}°</div>
          <div class="weather__desc">${description}</div>
        </div>
      </div>
      ${hourlyHTML}
      <div class="weather__details">
        <div class="weather__detail">
          <svg class="weather__detail-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span class="weather__detail-value">${feelsLike}°</span>
        </div>
        <div class="weather__detail">
          <svg class="weather__detail-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z"/>
          </svg>
          <span class="weather__detail-value">${humidity}%</span>
        </div>
        <div class="weather__detail">
          <svg class="weather__detail-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z"/>
          </svg>
          <span class="weather__detail-value">${wind} м/с</span>
        </div>
      </div>
      <button class="weather__expand" id="weather-expand-btn" title="Подробнее">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
    </div>
  `;
  
  const expandBtn = document.getElementById("weather-expand-btn");
  if (expandBtn) {
    expandBtn.addEventListener("click", () => openWeatherModal(data, forecastData));
  }

  const cityEditBtn = document.getElementById("weather-city-edit");
  if (cityEditBtn) {
    cityEditBtn.addEventListener("click", () => {
      const nextCity = window.prompt("Введите город", city);
      if (!nextCity || !nextCity.trim()) return;
      const cleanCity = nextCity.trim();
      saveCity(cleanCity);
      updateWeather(cleanCity);
    });
  }
  
  startTimeUpdate();
}

let timeUpdateInterval = null;

function startTimeUpdate() {
  if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  
  timeUpdateInterval = setInterval(() => {
    const timeEl = document.getElementById("weather-time");
    if (timeEl) {
      timeEl.textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
  }, 1000);
}

function openWeatherModal(currentWeather, forecastData) {
  const existingModal = document.getElementById("weather-modal");
  if (existingModal) existingModal.remove();
  
  const days = forecastData ? groupForecastByDay(forecastData.list) : [];
  const hourlyForecast = forecastData ? interpolateForecast(forecastData.list) : [];
  const now = Math.floor(Date.now() / 1000);
  const todayHours = hourlyForecast.filter(h => h.dt > now && h.dt < now + 24 * 60 * 60);
  
  const modal = document.createElement("div");
  modal.id = "weather-modal";
  modal.className = "weather-modal";
  modal.innerHTML = `
    <div class="weather-modal__overlay"></div>
    <div class="weather-modal__content">
      <div class="weather-modal__header">
        <h2>Прогноз погоды</h2>
        <button class="weather-modal__close" id="weather-modal-close">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="weather-modal__body">
        <div class="weather-modal__current">
          <div class="weather-modal__current-main">
            <img src="${getWeatherIcon(currentWeather.weather[0].icon)}" alt="${currentWeather.weather[0].description}">
            <div class="weather-modal__current-temp">${Math.round(currentWeather.main.temp)}°</div>
            <div class="weather-modal__current-desc">${currentWeather.weather[0].description}</div>
            <div class="weather-modal__current-city">${currentWeather.name}</div>
          </div>
          <div class="weather-modal__current-details">
            <div class="weather-modal__detail">
              <span class="weather-modal__detail-label">Ощущается</span>
              <span class="weather-modal__detail-value">${Math.round(currentWeather.main.feels_like)}°</span>
            </div>
            <div class="weather-modal__detail">
              <span class="weather-modal__detail-label">Влажность</span>
              <span class="weather-modal__detail-value">${currentWeather.main.humidity}%</span>
            </div>
            <div class="weather-modal__detail">
              <span class="weather-modal__detail-label">Ветер</span>
              <span class="weather-modal__detail-value">${Math.round(currentWeather.wind.speed)} м/с</span>
            </div>
            <div class="weather-modal__detail">
              <span class="weather-modal__detail-label">Давление</span>
              <span class="weather-modal__detail-value">${Math.round(currentWeather.main.pressure * 0.75)} мм</span>
            </div>
          </div>
        </div>
        
        ${todayHours.length > 0 ? `
          <div class="weather-modal__section">
            <h3>Сегодня по часам</h3>
            <div class="weather-modal__hourly">
              ${todayHours.map(hour => `
                <div class="weather-modal__hour">
                  <span class="weather-modal__hour-time">${formatTime(hour.dt)}</span>
                  <img src="${getWeatherIcon(hour.weather[0].icon)}" alt="${hour.weather[0].description}">
                  <span class="weather-modal__hour-temp">${Math.round(hour.main.temp)}°</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ''}
        
        ${days.length > 0 ? `
          <div class="weather-modal__section">
            <h3>Прогноз на неделю</h3>
            <div class="weather-modal__daily">
              ${days.slice(0, 5).map(day => {
                const midDay = day[Math.floor(day.length / 2)];
                const minTemp = Math.min(...day.map(h => h.main.temp_min));
                const maxTemp = Math.max(...day.map(h => h.main.temp_max));
                return `
                  <div class="weather-modal__day">
                    <span class="weather-modal__day-name">${formatDate(day[0].dt)}</span>
                    <img src="${getWeatherIcon(midDay.weather[0].icon)}" alt="${midDay.weather[0].description}">
                    <span class="weather-modal__day-desc">${midDay.weather[0].description}</span>
                    <span class="weather-modal__day-temps">
                      <span class="weather-modal__day-max">${Math.round(maxTemp)}°</span>
                      <span class="weather-modal__day-min">${Math.round(minTemp)}°</span>
                    </span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  
  const closeBtn = document.getElementById("weather-modal-close");
  const overlay = modal.querySelector(".weather-modal__overlay");
  
  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = "";
  };
  
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", escHandler);
    }
  });
}

function renderLoading() {
  const container = document.getElementById("weather");
  if (!container) return;
  container.innerHTML = `<div class="weather weather--loading">Загрузка погоды...</div>`;
}

function renderError(message) {
  const container = document.getElementById("weather");
  if (!container) return;
  container.innerHTML = `<div class="weather weather--error">${message}</div>`;
}

export async function initWeather(city) {
  const container = document.getElementById("weather");
  if (!container) {
    console.warn("Weather container not found");
    return;
  }

  const resolvedCity = city || getSavedCity();
  saveCity(resolvedCity);

  const cachedWeather = getCachedWeather(resolvedCity);
  const cachedForecast = getCachedForecast();
  
  if (cachedWeather) {
    renderWeather(cachedWeather, cachedForecast);
    if (!cachedForecast) {
      fetchForecast(cachedWeather.coord.lat, cachedWeather.coord.lon)
        .then(forecast => {
          cacheForecast(forecast);
          renderWeather(cachedWeather, forecast);
        })
        .catch(() => {});
    }
    return;
  }

  renderLoading();

  try {
    const data = await fetchWeather(resolvedCity);
    cacheWeather(data, resolvedCity);
    
    let forecastData = null;
    try {
      forecastData = await fetchForecast(data.coord.lat, data.coord.lon);
      cacheForecast(forecastData);
    } catch {}
    
    renderWeather(data, forecastData);
  } catch (error) {
    console.error("Weather error:", error);
    renderError("Не удалось загрузить погоду");
  }
}

export function updateWeather(city) {
  localStorage.removeItem(WEATHER_KEY);
  localStorage.removeItem(FORECAST_KEY);
  if (city) saveCity(city);
  initWeather(city);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initWeather());
} else {
  initWeather();
}
