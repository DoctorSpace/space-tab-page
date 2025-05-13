async function getWeather(city) {
  const apiKey = "ec67a42a350b8dfebc6de31008e7e150";
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=ru&appid=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Ошибка при получении данных");

    const data = await response.json();
    const weatherText = `Погода в ${data.name}: ${data.weather[0].description}, температура: ${data.main.temp}°C`;

    document.getElementById("weather").textContent = weatherText;
  } catch (error) {
    console.error(error);
    document.getElementById("weather").textContent =
      "Не удалось получить погоду";
  }
}

getWeather("Каменск-Шахтинский");
