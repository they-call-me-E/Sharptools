<!-- Do not edit below -->
<script type="application/json" id="tile-settings">
{
  "schema": "0.2.0",
  "settings": [],
  "name": "FlipBoard",
  "dimensions": {"height": 3, "width": 3}
}
</script>
<!-- Do not edit above -->

<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Split-Flap Board (Auto Sound + Real Weather + Rotation) — 20x8 Responsive</title>

<style>
:root{
  --cols:20;
  --rows:8;

  --gap:10px;

  --bg:#0b0c10;
  --tile:#14161d;
  --tileTop:#1a1d27;
  --edge:rgba(255,255,255,.1);
  --split:rgba(0,0,0,.55);
  --splitHi:rgba(255,255,255,.08);

  --text:#f3f4f6;

  --flip-ms:140ms;
  --persp:900px;
}

*{box-sizing:border-box}
html,body{height:100%}

body{
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  background:radial-gradient(1200px 700px at 50% 30%,#111827 0%,var(--bg) 55%,#05060a 100%);
  color:var(--text);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}

.wrap{
  width:min(1600px,96vw);
  max-width:100%;
  padding:12px;
  height: 96vh;
}

.boardShell{ width:100%; height: 100%; }

.board{
  display:grid;
  grid-template-columns:repeat(var(--cols), 1fr);
  grid-template-rows:repeat(var(--rows), 1fr);

  gap:var(--gap);
 /* padding:14px;
  border-radius:18px;*/
  background:rgba(0,0,0,.25);
  box-shadow:0 20px 60px rgba(0,0,0,.55);

  width:100%;
  height:100%;
  min-height:260px;

  overflow:hidden;
}

.tile{
  position:relative;
  background:linear-gradient(var(--tileTop),var(--tile));
  border:1px solid var(--edge);
  border-radius:12px;
  perspective:var(--persp);
  overflow:hidden;
}

.tile::after{
  content:"";
  position:absolute;
  left:0;right:0;top:50%;
  height:2px;
  transform:translateY(-50%);
  background:var(--split);
  box-shadow:0 1px 0 var(--splitHi);
  z-index:40;
}

.half{
  position:absolute;
  left:0; right:0;
  height:50%;
  overflow:hidden;
  display:block;

  font-weight:900;
  font-size:clamp(14px, 2.2vw, 52px);
  line-height:1;
  letter-spacing:.02em;
  text-shadow:0 2px 0 rgba(0,0,0,.6);
  user-select:none;
  backface-visibility:hidden;
}

.top.static{ top:0; z-index:10; }
.bottom.static{ bottom:0; z-index:10; }

.half .glyphText{
  position:absolute;
  left:0; right:0;
  top:0;
  height:200%;
  display:grid;
  place-items:center;
  transform:none;
  line-height:1;
}
.bottom .glyphText{ top:-100%; }

.flap{
  position:absolute;
  left:0; right:0;
  height:50%;
  overflow:hidden;
  z-index:30;
  backface-visibility:hidden;
  transform-style:preserve-3d;
}

.flap.top{
  top:0;
  transform-origin:50% 100%;
  transform:rotateX(0deg);
  background:linear-gradient(rgba(255,255,255,.06),rgba(0,0,0,.10));
}

.flap.bottom{
  bottom:0;
  transform-origin:50% 0%;
  transform:rotateX(90deg);
  background:linear-gradient(rgba(0,0,0,.18),rgba(255,255,255,.04));
}

.hidden{ opacity:0; visibility:hidden; pointer-events:none; }
.shown{ opacity:1; visibility:visible; pointer-events:none; }

.controls{
  margin-top:10px;
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  justify-content:flex-start;
  align-items:center;
  color:rgba(255,255,255,.65);
  font-size:13px;
}

button{
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:var(--text);
  padding:8px 10px;
  border-radius:10px;
  cursor:pointer;
  font-weight:650;
}
button:hover{ background:rgba(255,255,255,.09); }
</style>

<div class="wrap">
  <div class="boardShell">
    <div id="board" class="board"></div>
  </div>

  <div class="controls">
    <button id="demo">Demo</button>
    <button id="clear">Clear</button>
    <div id="gridLabel"></div>
  </div>
</div>

<script>
/* ============================================================
   CONFIG
============================================================ */
const COLS = 25;
const ROWS = 8;

document.documentElement.style.setProperty("--cols", COLS);
document.documentElement.style.setProperty("--rows", ROWS);
document.getElementById("gridLabel").textContent = `Grid: ${COLS}×${ROWS}`;

const CHARSET =
  " " +
  "QZ&9_@A(1]H+Y°S}L/3\"J0T'X=U\\V?N{F%G$C)W8P;D,5R:6I-4M.2E7B!K©®™O#[";

const FLIP_MS = 140;
const STAGGER = 6;

/* Weather API (imperial) */
const OWM_URL =
  "https://api.openweathermap.org/data/3.0/onecall?lat=35.0703678&lon=-81.960783&exclude=minutely,hourly&appid=1477cbdbd942d01b6e5b4eb630731226&units=imperial";

const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const STAGE_DWELL_MS = 15 * 1000;
const WEATHER_LOCATION_LABEL = "BOILING SPGS SC";

/* ============================================================
   HELPERS
============================================================ */
const clamp = (s,n)=> (s??"").toUpperCase().slice(0,n).padEnd(n," ");
const normalize = c => CHARSET.includes(c) ? c : " ";
const delay = ms => new Promise(r=>setTimeout(r,ms));
const randChar = () => CHARSET[Math.floor(Math.random()*CHARSET.length)];

function asRows(lines){
  const arr = Array.isArray(lines) ? lines : [];
  return Array.from({ length: ROWS }, (_, i) => clamp(arr[i] ?? "", COLS));
}

function fmtTime(d){
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2,"0");
  const ap = h >= 12 ? "P" : "A";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m}${ap}`;
}

function cleanCond(s){
  return String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 \-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

/* ============================================================
   BOARD EPOCHS + TIMER CANCEL
============================================================ */
let BOARD_EPOCH = 0;
let pendingTimers = [];
let ANIM_EPOCH = 0;

function bumpBoardEpoch(){ BOARD_EPOCH++; }
function bumpAnimEpoch(){ ANIM_EPOCH++; }

function clearPendingTimers(){
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers = [];
}

function cancelBoardWork(){
  clearPendingTimers();
  bumpBoardEpoch();
  bumpAnimEpoch();
}

/* ============================================================
   SOUND (Web Audio – auto enabled w/ master toggle)
============================================================ */
const SOUND_ENABLED = true;

const CLICK_URL =
  "https://raw.githubusercontent.com/they-call-me-E/Sharptools/main/CustomeTile/SplitFlap/Split-Flap.mp3";

let audioCtx = null;
let clickBuffer = null;
let soundReady = false;
let soundInitStarted = false;

function ensureAudioCtx(){
  if (!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function initSound(){
  if (!SOUND_ENABLED || soundInitStarted) return;
  soundInitStarted = true;

  try{
    const ctx = ensureAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();

    const res = await fetch(CLICK_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Sound fetch failed: ${res.status} ${res.statusText}`);

    const buf = await res.arrayBuffer();
    clickBuffer = await ctx.decodeAudioData(buf.slice(0));
    soundReady = true;
    console.log("✅ Split-flap sound ready");
  }catch(err){
    console.error("❌ Sound init failed:", err);
    soundReady = false;
    clickBuffer = null;
  }
}

async function autoEnableSound(){
  if (!SOUND_ENABLED) return;
  await initSound();
  if (soundReady) playFlap("A", { force:true, volume:0.06 });
}
window.addEventListener("pointerdown", autoEnableSound, { once:true });
window.addEventListener("keydown", autoEnableSound, { once:true });

const SOUND_MAX_PER_SEC = 18;
const SOUND_MIN_GAP_MS = Math.floor(1000 / SOUND_MAX_PER_SEC);
let lastSoundAt = 0;
let soundCarry = 0;

function shouldPlayClick(){
  const now = performance.now();
  const gap = now - lastSoundAt;
  if (gap < SOUND_MIN_GAP_MS) return false;

  soundCarry = Math.max(0, soundCarry - gap * 0.02);
  const probability = Math.max(0.25, 1 - soundCarry * 0.06);
  return Math.random() < probability;
}

function isAudibleChar(ch){ return ch !== " "; }

function playFlap(ch, opts = {}){
  if (!SOUND_ENABLED || !soundReady || !clickBuffer) return;

  const force = !!opts.force;
  const vol = typeof opts.volume === "number" ? opts.volume : 0.18;

  if (!force){
    if (!isAudibleChar(ch)) return;
    if (!shouldPlayClick()) return;
  }

  lastSoundAt = performance.now();
  soundCarry += 1;

  const ctx = ensureAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = clickBuffer;
  src.playbackRate.value = 0.92 + Math.random() * 0.16;

  const gain = ctx.createGain();
  gain.gain.value = vol;

  src.connect(gain).connect(ctx.destination);
  src.start();
}

/* ============================================================
   TILE (TRUE SPLIT-FLAP)
============================================================ */
class Tile{
  constructor(el){
    this.el = el;

    this.topStatic = el.querySelector(".top.static .glyphText");
    this.botStatic = el.querySelector(".bottom.static .glyphText");

    this.topFlap = el.querySelector(".flap.top");
    this.botFlap = el.querySelector(".flap.bottom");

    this.topFlapText = el.querySelector(".flap.top .glyphText");
    this.botFlapText = el.querySelector(".flap.bottom .glyphText");

    this.current = " ";
    this.target = " ";
    this.running = false;

    this.resetFlaps();
  }

  resetFlaps(){
    this.topFlap.classList.remove("shown"); this.topFlap.classList.add("hidden");
    this.botFlap.classList.remove("shown"); this.botFlap.classList.add("hidden");

    this.topFlap.style.transition = "none";
    this.botFlap.style.transition = "none";
    this.topFlap.style.transform = "rotateX(0deg)";
    this.botFlap.style.transform = "rotateX(90deg)";
    void this.el.offsetWidth;
    this.topFlap.style.transition = `transform ${FLIP_MS}ms linear`;
    this.botFlap.style.transition = `transform ${FLIP_MS}ms linear`;
  }

  setInstant(c){
    this.current = this.target = normalize(c);
    this.topStatic.textContent = this.current;
    this.botStatic.textContent = this.current;
    this.resetFlaps();
  }

  setTarget(c){
    this.target = normalize(c);
    if (!this.running) this.run();
  }

  step(c){
    return CHARSET[(CHARSET.indexOf(c)+1) % CHARSET.length];
  }

  async run(){
    if (this.current === this.target) return;
    this.running = true;

    const myEpoch = ANIM_EPOCH;

    while (this.current !== this.target){
      if (myEpoch !== ANIM_EPOCH) break;

      const next = this.step(this.current);
      await this.flipTo(next, myEpoch);

      if (myEpoch !== ANIM_EPOCH) break;
      this.current = next;
    }

    this.running = false;
  }

  async flipTo(next, myEpoch){
    if (myEpoch !== ANIM_EPOCH) return;

    this.topFlapText.textContent = this.current;
    this.botFlapText.textContent = next;

    this.topFlap.classList.remove("hidden"); this.topFlap.classList.add("shown");
    this.botFlap.classList.remove("hidden"); this.botFlap.classList.add("shown");

    this.topFlap.style.transition = "none";
    this.botFlap.style.transition = "none";
    this.topFlap.style.transform = "rotateX(0deg)";
    this.botFlap.style.transform = "rotateX(90deg)";
    void this.el.offsetWidth;
    this.topFlap.style.transition = `transform ${FLIP_MS}ms linear`;
    this.botFlap.style.transition = `transform ${FLIP_MS}ms linear`;

    this.topFlap.style.transform = "rotateX(-90deg)";
    this.botFlap.style.transform = "rotateX(0deg)";

    playFlap(next);

    await delay(FLIP_MS/2);
    if (myEpoch !== ANIM_EPOCH) return;

    this.topStatic.textContent = next;
    this.botStatic.textContent = next;

    await delay(FLIP_MS/2);
    if (myEpoch !== ANIM_EPOCH) return;

    this.resetFlaps();
  }
}

/* ============================================================
   BUILD BOARD
============================================================ */
const board = document.getElementById("board");
board.style.setProperty("--cols",COLS);
board.style.setProperty("--rows",ROWS);

const tiles = [];
for (let i=0;i<COLS*ROWS;i++){
  const tile = document.createElement("div");
  tile.className="tile";
  tile.innerHTML = `
    <div class="half top static"><span class="glyphText"> </span></div>
    <div class="half bottom static"><span class="glyphText"> </span></div>

    <div class="flap top hidden">
      <div class="half top" style="position:relative;height:100%;">
        <span class="glyphText"> </span>
      </div>
    </div>

    <div class="flap bottom hidden">
      <div class="half bottom" style="position:relative;height:100%;">
        <span class="glyphText"> </span>
      </div>
    </div>
  `;
  board.appendChild(tile);
  const t = new Tile(tile);
  t.setInstant(" ");
  tiles.push(t);
}

/* ============================================================
   API
============================================================ */
function setLines(lines){
  const epoch = BOARD_EPOCH;
  const padded = asRows(lines);
  const flat = padded.join("").split("");

  flat.forEach((c,i)=>{
    const id = setTimeout(()=>{
      if (epoch !== BOARD_EPOCH) return;
      tiles[i].setTarget(c);
    }, i * STAGGER);
    pendingTimers.push(id);
  });
}
window.setLines = setLines;

function waitForAllTiles(){
  return new Promise(resolve => {
    const check = () => {
      if (tiles.every(t => !t.running)) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

async function setLinesAndWait(lines){
  clearPendingTimers();
  setLines(lines);
  await waitForAllTiles();
}

/* ============================================================
   BOOT
============================================================ */
function boot(lines){
  cancelBoardWork();
  tiles.forEach(t => t.setInstant(randChar()));
  const id = setTimeout(()=>setLines(lines), 60);
  pendingTimers.push(id);
}

/* ============================================================
   WEATHER
============================================================ */
let lastWeatherPayload = null;
let lastWeatherFetchedAt = null;
let weatherRefreshTimer = null;

async function fetchWeather(){
  const res = await fetch(OWM_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  lastWeatherPayload = json;
  lastWeatherFetchedAt = new Date();
  return json;
}

function formatWeatherLines(payload){
  const updated = lastWeatherFetchedAt ? fmtTime(lastWeatherFetchedAt) : fmtTime(new Date());

  const temp = payload?.current?.temp;
  const feels = payload?.current?.feels_like;
  const wind = payload?.current?.wind_speed;
  const cond = cleanCond(
    payload?.current?.weather?.[0]?.description ||
    payload?.current?.weather?.[0]?.main ||
    "N/A"
  );

  const t = (typeof temp === "number") ? Math.round(temp) : null;
  const f = (typeof feels === "number") ? Math.round(feels) : null;
  const w = (typeof wind === "number") ? Math.round(wind) : null;

  const showFeels = (t != null && f != null && Math.abs(f - t) >= 3);
  const hot = (t != null && t >= 100) || (f != null && f >= 100);

  const line1 = `${WEATHER_LOCATION_LABEL}`;
  let line2;
  if (t == null) line2 = "--°";
  else if (showFeels && f != null) line2 = hot ? `${t}° FL ${f}°` : `${t}°  FEELS: ${f}°`;
  else line2 = `${t}°`;

  const line3 = `${cond}${(w != null ? `  WND: ${w}MPH` : "")}`;
  const line4 = `UPDATED: ${updated}`;

  // 4 lines of weather + 4 blank lines (for 8-row board)
  return asRows([ line1, line2, line3, line4 ]);
}

async function showWeather(){
  if (!lastWeatherPayload) await fetchWeather();
  await setLinesAndWait(formatWeatherLines(lastWeatherPayload));
}

function startWeatherRefresh(){
  if (weatherRefreshTimer) clearTimeout(weatherRefreshTimer);

  const loop = async () => {
    try{ await fetchWeather(); }
    catch(e){ console.warn("Weather fetch failed (keeping cached):", e); }
    weatherRefreshTimer = setTimeout(loop, WEATHER_REFRESH_MS);
  };
  loop();
}

function stopWeatherRefresh(){
  if (weatherRefreshTimer) clearTimeout(weatherRefreshTimer);
  weatherRefreshTimer = null;
}

/* ============================================================
   ROTATION
============================================================ */
let rotateEnabled = true;
let rotateTimer = null;
let rotateRunId = 0;

function stopRotation(){
  rotateEnabled = false;
  if (rotateTimer) clearTimeout(rotateTimer);
  rotateTimer = null;
  rotateRunId++;
}

function startRotation(){
  rotateEnabled = true;
  const runId = ++rotateRunId;

  const stage1 = asRows([
    "WELCOME",
    "JAKE",
    "SMART HOME DASHBOARD",
    "SPLIT FLAP",
    "", "", "", ""
  ]);

  const stage2 = asRows([
    "4:00 PM  TUTOR E",
    "5-7 PM   BULLDOG BALL",
    "7:30 PM  DINNER",
    "9:00 PM  WIND DOWN",
    "", "", "", ""
  ]);

  const loop = async () => {
    if (!rotateEnabled || runId !== rotateRunId) return;

    cancelBoardWork();
    await showWeather();
    if (!rotateEnabled || runId !== rotateRunId) return;
    await delay(STAGE_DWELL_MS);

    cancelBoardWork();
    await setLinesAndWait(stage1);
    if (!rotateEnabled || runId !== rotateRunId) return;
    await delay(STAGE_DWELL_MS);

    cancelBoardWork();
    await setLinesAndWait(stage2);
    if (!rotateEnabled || runId !== rotateRunId) return;
    await delay(STAGE_DWELL_MS);

    rotateTimer = setTimeout(loop, 0);
  };

  loop();
}

/* ============================================================
   BUTTONS
============================================================ */
document.getElementById("demo").addEventListener("click", async ()=>{
  await initSound();

  stopRotation();
  cancelBoardWork();

  await setLinesAndWait(asRows([
    "WELCOME",
    "JAKE",
    "DEMO MODE",
    "STAGE 1",
    "", "", "", ""
  ]));

  await delay(10 * 1000);

  await setLinesAndWait(asRows([
    "4:00 PM  TUTOR E",
    "5-7 PM   BULLDOG BALL",
    "7:30 PM  DINNER",
    "9:00 PM  WIND DOWN",
    "", "", "", ""
  ]));

  startRotation();
});

document.getElementById("clear").addEventListener("click", async ()=>{
  await initSound();
  stopRotation();
  stopWeatherRefresh();
  cancelBoardWork();
  await setLinesAndWait(asRows(["","","","","","","",""]));
});

/* ============================================================
   STARTUP
============================================================ */
boot(asRows([
  "SPLITFLAP",
  `${COLS} X ${ROWS}`,
  "DISPLAY",
  "READY",
  "", "", "", ""
]));

startWeatherRefresh();
setTimeout(()=>startRotation(), 1200);
</script>
