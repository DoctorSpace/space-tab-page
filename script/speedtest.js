const TEST_FILE = "https://speed.cloudflare.com/__down?bytes=5000000";

async function detectCountry() {
  try {
    const response = await fetch("https://speed.cloudflare.com/cdn-cgi/trace?cacheBust=" + Date.now(), {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Country detect failed");
    const text = await response.text();
    const codeLine = text.split("\n").find((line) => line.startsWith("loc="));
    const code = codeLine ? codeLine.slice(4).trim().toUpperCase() : "";
    return {
      code
    };
  } catch {
    return {
      code: ""
    };
  }
}

async function testDownload(onProgress) {
  const start = performance.now();
  const response = await fetch(TEST_FILE + "&cacheBust=" + Date.now(), {
    cache: "no-store",
  });
  
  if (!response.ok) throw new Error("Download failed");
  
  const reader = response.body.getReader();
  let received = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (onProgress) onProgress(received);
  }
  
  const duration = (performance.now() - start) / 1000;
  return (received * 8) / duration / 1000000;
}

async function testPing(host = "yandex.ru") {
  const results = [];
  const iterations = 4;
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      await fetch(`https://${host}/favicon.ico?cacheBust=` + Date.now(), {
        mode: "no-cors",
        cache: "no-store",
      });
    } catch (e) {}
    const duration = performance.now() - start;
    results.push(duration);
  }
  
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  return Math.round(avg);
}

export async function runSpeedTest(onProgress) {
  let downloadSpeed = 0;
  let ping = 0;

  onProgress({ stage: "country", status: "testing" });
  const country = await detectCountry();
  if (country.code) {
    onProgress({ stage: "country", status: "done", countryCode: country.code });
  } else {
    onProgress({ stage: "country", status: "error" });
  }
  
  try {
    onProgress({ stage: "ping", status: "testing" });
    ping = await testPing();
    onProgress({ stage: "ping", status: "done", ping });
  } catch (e) {
    onProgress({ stage: "ping", status: "error" });
  }
  
  try {
    onProgress({ stage: "download", status: "testing" });
    downloadSpeed = await testDownload((bytes) => {
      onProgress({ stage: "download", status: "progress", bytes });
    });
    onProgress({ stage: "download", status: "done", speed: downloadSpeed });
  } catch (e) {
    onProgress({ stage: "download", status: "error" });
  }
  
  return { download: downloadSpeed, ping, countryCode: country.code };
}
