// === Configuration ===
const API_KEY = "bd4ea33ecf905116d12af172e008dbae"; // Provided by user
const API_BASE = "https://api.openweathermap.org/data/2.5";

// === Elements ===
const cityInput = document.getElementById("city-input");
const searchForm = document.getElementById("search-form");
const searchBtn = document.getElementById("search-btn");
const geoBtn = document.getElementById("geo-btn");
const themeToggle = document.getElementById("theme-toggle");
const refreshBtn = document.getElementById("refresh-btn");
const micBtn = document.getElementById("mic-btn");

const cityNameEl = document.getElementById("city-name");
const localTimeEl = document.getElementById("local-time");
const tempEl = document.getElementById("temp");
const descEl = document.getElementById("desc");
const iconEl = document.getElementById("icon");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const sunriseEl = document.getElementById("sunrise");
const sunsetEl = document.getElementById("sunset");
const tipEl = document.getElementById("tip");

const forecastGrid = document.getElementById("forecast");
const aboutDialog = document.getElementById("about-dialog");
const aboutLink = document.getElementById("about-link");
const toast = document.getElementById("toast");

// === Utilities ===
function showToast(msg){
  toast.textContent = msg;
  toast.className = "toast show";
  setTimeout(() => toast.className = "toast", 2200);
}

function setTheme(theme){
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function toggleTheme(){
  const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(next);
}

function kToC(k){ return Math.round(k - 273.15); }
function formatTimeFromUnix(ts, tzOffsetSeconds){
  // ts is in seconds, tzOffsetSeconds can be +/-
  const d = new Date((ts + tzOffsetSeconds) * 1000);
  return d.toUTCString().slice(17,22); // HH:MM
}
function formatDateFromUnix(ts, tzOffsetSeconds){
  const d = new Date((ts + tzOffsetSeconds) * 1000);
  return d.toUTCString().slice(0,16); // e.g., Wed, 14 Aug
}

function pickBgByMain(main){
  const key = (main || '').toLowerCase();
  if(key.includes('clear')) return 'clear';
  if(key.includes('cloud')) return 'clouds';
  if(key.includes('rain')) return 'rain';
  if(key.includes('drizzle')) return 'drizzle';
  if(key.includes('thunder')) return 'thunderstorm';
  if(key.includes('snow')) return 'snow';
  if(['mist','fog','haze','smoke','dust','sand','ash','squall','tornado'].some(s => key.includes(s))) return 'mist';
  return 'clouds';
}

function tipFor(main, tempC){
  const key = (main||'').toLowerCase();
  if(key.includes('rain') || key.includes('drizzle') || key.includes('thunder')) return "Carry an umbrella and wear waterproof shoes.";
  if(key.includes('snow')) return "Stay warm! Roads may be slippery.";
  if(key.includes('clear') && tempC >= 30) return "It's hot and sunny — stay hydrated and wear sunscreen.";
  if(key.includes('clear')) return "Lovely clear skies. Great day for a walk!";
  if(key.includes('cloud')) return "Cloudy vibes—maybe a cozy drink?";
  if(key.includes('mist') || key.includes('fog') || key.includes('haze')) return "Low visibility—drive carefully.";
  return "Have a great day!";
}

// Cache helpers (for simple offline experience)
function saveLastPayload(city, payload){
  localStorage.setItem("lastCity", city);
  localStorage.setItem("lastPayload", JSON.stringify(payload));
}
function loadLastPayload(){
  const p = localStorage.getItem("lastPayload");
  if(!p) return null;
  try{ return JSON.parse(p); }catch{ return null; }
}

// Voice search (best-effort)
function initVoiceSearch(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ micBtn.disabled = true; micBtn.title = "Voice search not supported"; return; }
  const rec = new SR();
  rec.lang = "en-GB";
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e) => {
    let text = e.results[0][0].transcript;
    // Remove trailing punctuation like a period or comma
    text = text.trim().replace(/[.,;:!?]$/, "");
    cityInput.value = text;
    searchCity(text);
  };
  
  rec.onerror = () => showToast("Voice search error");
  micBtn.addEventListener("click", () => { try{ rec.start(); } catch{} });
}


// === API Calls ===
async function fetchCurrent(q){
  const url = `${API_BASE}/weather?q=${encodeURIComponent(q)}&appid=${API_KEY}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch current weather");
  return r.json();
}
async function fetchForecast(q){
  const url = `${API_BASE}/forecast?q=${encodeURIComponent(q)}&appid=${API_KEY}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch forecast");
  return r.json();
}
async function fetchCurrentByCoords(lat, lon){
  const url = `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch current weather");
  return r.json();
}
async function fetchForecastByCoords(lat, lon){
  const url = `${API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("Failed to fetch forecast");
  return r.json();
}

// === Renderers ===
function renderCurrent(data){
  const { name, sys, weather, main, wind, timezone } = data;
  const w = weather?.[0] || {};
  const tempC = kToC(main.temp);
  cityNameEl.textContent = `${name}, ${sys.country}`;
  localTimeEl.textContent = formatDateFromUnix(data.dt, timezone) + " " + formatTimeFromUnix(data.dt, timezone);
  tempEl.textContent = `${tempC}°C`;
  descEl.textContent = w.description ? w.description[0].toUpperCase() + w.description.slice(1) : "—";
  iconEl.src = w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : "";
  iconEl.alt = w.description || "Icon";

  humidityEl.textContent = `${main.humidity}%`;
  windEl.textContent = `${Math.round(wind.speed)} m/s`;
  sunriseEl.textContent = formatTimeFromUnix(sys.sunrise, timezone);
  sunsetEl.textContent = formatTimeFromUnix(sys.sunset, timezone);

  tipEl.textContent = tipFor(w.main, tempC);

  // background
  document.body.setAttribute("data-bg", pickBgByMain(w.main));
}

function groupForecastByDay(list, tzOffset){
  // get one item per day at ~12:00 local time; fallback to max temp slot
  const map = new Map();
  for(const item of list){
    const localHour = new Date((item.dt + tzOffset) * 1000).getUTCHours();
    const dayKey = new Date((item.dt + tzOffset) * 1000).toUTCString().slice(0,16);
    if(!map.has(dayKey)) map.set(dayKey, []);
    map.get(dayKey).push({ hour: localHour, item });
  }
  const days = [];
  for(const [day, arr] of map.entries()){
    // Prefer entry closest to 12:00
    arr.sort((a,b) => Math.abs(a.hour-12) - Math.abs(b.hour-12));
    days.push({ day, pick: arr[0].item });
  }
  // sort by dt
  days.sort((a,b) => a.pick.dt - b.pick.dt);
  // limit to 5 days
  return days.slice(0,5);
}

function renderForecast(data){
  const { list, city } = data;
  forecastGrid.innerHTML = "";
  if(!list || !list.length) return;

  const days = groupForecastByDay(list, city.timezone);
  for(const {day, pick} of days){
    const tempC = kToC(pick.main.temp);
    const icon = pick.weather?.[0]?.icon;
    const desc = pick.weather?.[0]?.description || "";
    const min = Math.round(pick.main.temp_min - 273.15);
    const max = Math.round(pick.main.temp_max - 273.15);

    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div class="d">${day}</div>
      <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}">
      <div class="t"><strong>${tempC}°C</strong></div>
      <div class="r muted">${desc}</div>
      <div class="mm muted">min ${min}° • max ${max}°</div>
    `;
    forecastGrid.appendChild(el);
  }
}

// === App Logic ===
async function searchCity(q){
  if(!q) return;
  setLoading(true);
  try{
    const [current, forecast] = await Promise.all([fetchCurrent(q), fetchForecast(q)]);
    renderCurrent(current);
    renderForecast(forecast);
    saveLastPayload(current.name, { current, forecast });
    showToast("Updated weather");
  }catch(err){
    console.error(err);
    showToast("Could not fetch weather. Showing last saved data if available.");
    const cached = loadLastPayload();
    if(cached){
      renderCurrent(cached.current);
      renderForecast(cached.forecast);
    }
  }finally{
    setLoading(false);
  }
}

async function useGeolocation(){
  if(!navigator.geolocation){ showToast("Geolocation not supported"); return; }
  setLoading(true);
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    try{
      const { latitude, longitude } = pos.coords;
      const [current, forecast] = await Promise.all([
        fetchCurrentByCoords(latitude, longitude),
        fetchForecastByCoords(latitude, longitude)
      ]);
      renderCurrent(current);
      renderForecast(forecast);
      saveLastPayload(current.name, { current, forecast });
      showToast("Using your location");
    }catch(e){
      console.error(e);
      showToast("Failed to fetch for your location");
    }finally{
      setLoading(false);
    }
  }, (err)=>{
    setLoading(false);
    showToast("Location permission denied");
  });
}

function setLoading(isLoading){
  if(isLoading){
    document.body.style.cursor = "progress";
    refreshBtn.disabled = true;
    searchBtn.disabled = true;
    geoBtn.disabled = true;
  }else{
    document.body.style.cursor = "default";
    refreshBtn.disabled = false;
    searchBtn.disabled = false;
    geoBtn.disabled = false;
  }
}

// === Event Listeners ===
searchForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  searchCity(cityInput.value.trim());
});

geoBtn.addEventListener("click", useGeolocation);
refreshBtn.addEventListener("click", ()=>{
  const lastCity = localStorage.getItem("lastCity") || cityInput.value.trim();
  if(lastCity) searchCity(lastCity);
});
themeToggle.addEventListener("click", toggleTheme);
aboutLink.addEventListener("click", (e)=>{ e.preventDefault(); aboutDialog.showModal(); });

// init
(function init(){
  // theme
  const existing = localStorage.getItem("theme") || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(existing);

  // voice
  initVoiceSearch();

  const last = localStorage.getItem("lastCity");
  if(last){
    cityInput.value = last;
    searchCity(last);
  }else{
    // Try geolocation on first load
    useGeolocation();
  }
})();

// Simple toast styles (injected)
const toastStyle = document.createElement('style');
toastStyle.textContent = `
#toast{ position: fixed; left:50%; transform: translateX(-50%); bottom: 20px; background: var(--card); color: var(--text);
  border:1px solid var(--border); border-radius:.8rem; padding:.6rem .9rem; opacity:0; pointer-events:none; transition: opacity .2s ease; }
#toast.show{ opacity:1; }
`;
document.head.appendChild(toastStyle);
