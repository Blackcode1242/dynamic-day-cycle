import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  PHASE_LABELS, SPEEDS, formatHour, gameSeconds, hourOfDay, normalizeClock, parseHour, phaseAt, readClock, tintHex, CLOCK_KEY, moonLabel
} from "./clock";
import type { ClockState, TintLayer } from "./clock";

let clock: ClockState = normalizeClock(null);
let isGM = false;
let sceneReady = false;
let writeTimer: number | undefined;

function fmtDuration(seconds: number) {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1).replace(".", ",")} h`;
}

function speedLabel(s: number) {
  const n = String(s).replace(".", ",");
  return `×${n} (${fmtDuration(86400 / s)}/dia)`;
}

function render() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <main>
      <header>
        <div class="eyebrow">OWLBEAR RODEO · EXTENSION</div>
        <h1>Dynamic <span>Day Cycle</span></h1>
      </header>

      <nav class="tabs">
        <button class="tab-btn active" data-tab="tab-clock">⏱ Relógio</button>
        <button class="tab-btn" data-tab="tab-filter">🎨 Filtros & Luzes</button>
        <button class="tab-btn" data-tab="tab-effects">🌌 Atmosfera</button>
      </nav>

      <section class="panel">
        <p id="noScene" class="ro" hidden>Abra uma cena para usar o ciclo de dia.</p>
        <p id="roMsg" class="ro" hidden>Só o GM pode alterar o relógio. Você vê a hora em tempo real.</p>

        <!-- ABA 1: RELÓGIO -->
        <div id="tab-clock" class="tab-content">
          <label class="switch">
            <input id="enabled" type="checkbox" />
            <span class="track"></span>
            <span class="switch-text">Ciclo ativo nesta cena</span>
          </label>

          <div class="clockbox">
            <div>
              <div class="bigtime" id="time">--:--</div>
              <div class="phase" id="phase"></div>
            </div>
            <div class="swatch" id="swatch" title="Cor do filtro agora"></div>
          </div>
          <p class="hint" id="moonInfo">Lua: --</p>

          <div class="btnrow">
            <button id="toggle" class="btn primary" type="button" style="flex:1">▶ Iniciar</button>
          </div>
          <div class="btnrow quicktime">
            <button id="plus1" class="btn" type="button">+1h</button>
            <button id="plus8" class="btn" type="button">+8h</button>
            <button id="toDawn" class="btn" type="button">Amanhecer</button>
            <button id="toDusk" class="btn" type="button">Anoitecer</button>
          </div>

          <div class="row">
            <div class="grow">
              <label for="setTime">Definir hora</label>
              <input id="setTime" type="time" />
            </div>
            <div class="grow" style="align-content:end">
              <button id="applyTime" class="btn" type="button" style="width:100%">Aplicar</button>
            </div>
          </div>

          <label for="speed">Velocidade do tempo</label>
          <select id="speed">
            ${SPEEDS.map((s) => `<option value="${s}">${speedLabel(s)}</option>`).join("")}
            <option value="custom">Personalizada…</option>
          </select>
          <input id="customSpeed" type="number" min="0.01" max="5000" step="0.01" placeholder="Multiplicador" hidden />
          <p class="hint small" id="speedInfo"></p>
        </div>

        <!-- ABA 2: FILTROS E LUZES -->
        <div id="tab-filter" class="tab-content" hidden>
          <label class="switch">
            <input id="tint" type="checkbox" />
            <span class="track"></span>
            <span class="switch-text">Filtro de cor no mapa</span>
          </label>

          <label for="biome">Perfil de cenário</label>
          <select id="biome">
            <option value="urban">Urbano / Padrão (Neutro)</option>
            <option value="desert">Deserto · dourado e noite fria</option>
            <option value="forest">Floresta · verde-azulado</option>
            <option value="snow">Neve · luz fria</option>
            <option value="swamp">Pântano · verde e ocre</option>
            <option value="bloodmoon">Lua de Sangue · sombrio / terror</option>
          </select>

          <label for="strength">Força do filtro <output id="strengthValue"></output></label>
          <input id="strength" type="range" min="0.1" max="0.85" step="0.05" />

          <label for="tintLayer">O filtro cobre</label>
          <select id="tintLayer">
            <option value="DRAWING">Só o mapa e desenhos (tokens livres)</option>
            <option value="ATTACHMENT">Mapa e tokens</option>
          </select>

          <label for="stagger">Variação das luzes <output id="staggerValue"></output></label>
          <input id="stagger" type="range" min="0" max="90" step="5" />
        </div>

        <!-- ABA 3: ATMOSFERA E EFEITOS -->
        <div id="tab-effects" class="tab-content" hidden>
          <label class="switch">
            <input id="atmosphere" type="checkbox" />
            <span class="track"></span>
            <span class="switch-text">Ativar efeitos atmosféricos</span>
          </label>

          <div style="display:grid; gap:8px; margin-top:4px; padding-left:4px;">
            <label class="switch">
              <input id="fogEnabled" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">Neblina matinal</span>
            </label>
            <label class="switch">
              <input id="raysEnabled" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">Raios solares (crepúsculo)</span>
            </label>
            <label class="switch">
              <input id="starsEnabled" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">Céu estrelado à noite</span>
            </label>
          </div>

          <div class="row" style="margin-top:6px;">
            <div class="grow">
              <label for="sunrise">Nascer do sol</label>
              <input id="sunrise" type="time" />
            </div>
            <div class="grow">
              <label for="sunset">Pôr do sol</label>
              <input id="sunset" type="time" />
            </div>
          </div>
        </div>
      </section>
      <footer>Dynamic Day Cycle v0.2.0</footer>
    </main>`;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function wire() {
  document.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => (c as HTMLElement).hidden = true);
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab")!;
      $(`#${targetId}`).hidden = false;
    });
  });

  const enabledEl = $<HTMLInputElement>("#enabled");
  const timeEl = $<HTMLElement>("#time");
  const phaseEl = $<HTMLElement>("#phase");
  const swatchEl = $<HTMLElement>("#swatch");
  const toggleEl = $<HTMLButtonElement>("#toggle");
  const setTimeEl = $<HTMLInputElement>("#setTime");
  const applyTimeEl = $<HTMLButtonElement>("#applyTime");
  const speedEl = $<HTMLSelectElement>("#speed");
  const customEl = $<HTMLInputElement>("#customSpeed");
  const infoEl = $<HTMLElement>("#speedInfo");
  const sunriseEl = $<HTMLInputElement>("#sunrise");
  const sunsetEl = $<HTMLInputElement>("#sunset");
  const tintEl = $<HTMLInputElement>("#tint");
  const strengthEl = $<HTMLInputElement>("#strength");
  const strengthValue = $<HTMLOutputElement>("#strengthValue");
  const layerEl = $<HTMLSelectElement>("#tintLayer");
  const staggerEl = $<HTMLInputElement>("#stagger");
  const staggerValue = $<HTMLOutputElement>("#staggerValue");
  const biomeEl = $<HTMLSelectElement>("#biome");
  const atmosphereEl = $<HTMLInputElement>("#atmosphere");
  const fogEl = $<HTMLInputElement>("#fogEnabled");
  const raysEl = $<HTMLInputElement>("#raysEnabled");
  const starsEl = $<HTMLInputElement>("#starsEnabled");
  const moonInfoEl = $<HTMLElement>("#moonInfo");
  const roMsg = $<HTMLElement>("#roMsg");
  const noScene = $<HTMLElement>("#noScene");

  async function commit(changes: Partial<ClockState>) {
    if (!isGM || !sceneReady) return;
    const now = Date.now();
    const next = normalizeClock({ ...clock, anchorGame: gameSeconds(clock, now), anchorReal: now, ...changes });
    clock = next;
    try { await OBR.scene.setMetadata({ [CLOCK_KEY]: next }); } catch (e) { console.error(e); }
    refreshControls();
  }

  function commitSoon(changes: Partial<ClockState>) {
    window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => commit(changes), 200);
  }

  function refreshControls() {
    const known = SPEEDS.includes(clock.speed);
    speedEl.value = known ? String(clock.speed) : "custom";
    customEl.hidden = known;
    if (!known) customEl.value = String(clock.speed);
    infoEl.textContent = `1h de jogo = ${fmtDuration(3600 / clock.speed)} reais.`;
    enabledEl.checked = clock.enabled;
    tintEl.checked = clock.tint;
    strengthEl.value = String(clock.strength);
    strengthValue.value = `${Math.round(clock.strength * 100)}%`;
    layerEl.value = clock.tintLayer;
    staggerEl.value = String(clock.stagger);
    biomeEl.value = clock.biome;
    atmosphereEl.checked = clock.atmosphere;
    fogEl.checked = clock.fogEnabled;
    raysEl.checked = clock.raysEnabled;
    starsEl.checked = clock.starsEnabled;
    staggerValue.value = `±${clock.stagger} min`;
    if (document.activeElement !== sunriseEl) sunriseEl.value = formatHour(clock.sunrise);
    if (document.activeElement !== sunsetEl) sunsetEl.value = formatHour(clock.sunset);
    toggleEl.textContent = clock.running ? "⏸ Pausar" : "▶ Iniciar";
    const lock = !isGM || !sceneReady;
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) el.disabled = lock;
    roMsg.hidden = isGM || !sceneReady;
    noScene.hidden = sceneReady;
  }

  function tick() {
    const h = hourOfDay(clock);
    timeEl.textContent = formatHour(h);
    phaseEl.textContent = clock.enabled ? PHASE_LABELS[phaseAt(h, clock)] : "Ciclo desligado";
    swatchEl.style.background = `#${tintHex(h, clock)}`;
    moonInfoEl.textContent = `Lua: ${moonLabel(clock)}`;
    if (document.activeElement !== setTimeEl && !setTimeEl.value) setTimeEl.value = formatHour(h);
  }

  enabledEl.addEventListener("change", () => commit({ enabled: enabledEl.checked }));
  toggleEl.addEventListener("click", () => commit({ running: !clock.running, enabled: true }));
  const advance = (seconds: number) => commit({ anchorGame: gameSeconds(clock) + seconds, enabled: true });
  $("#plus1").addEventListener("click", () => advance(3600));
  $("#plus8").addEventListener("click", () => advance(8 * 3600));
  $("#toDawn").addEventListener("click", () => {
    const now = gameSeconds(clock), day = Math.floor(now / 86400);
    const target = day * 86400 + clock.sunrise * 3600;
    advance(target > now ? target - now : target + 86400 - now);
  });
  $("#toDusk").addEventListener("click", () => {
    const now = gameSeconds(clock), day = Math.floor(now / 86400);
    const target = day * 86400 + clock.sunset * 3600;
    advance(target > now ? target - now : target + 86400 - now);
  });
  applyTimeEl.addEventListener("click", () => {
    const h = parseHour(setTimeEl.value);
    if (h !== null) commit({ anchorGame: Math.floor(gameSeconds(clock) / 86400) * 86400 + h * 3600 });
  });
  speedEl.addEventListener("change", () => {
    if (speedEl.value === "custom") { customEl.hidden = false; customEl.focus(); return; }
    commit({ speed: Number(speedEl.value) });
  });
  customEl.addEventListener("change", () => { const v = Number(customEl.value); if (v > 0) commit({ speed: v }); });
  sunriseEl.addEventListener("change", () => { const h = parseHour(sunriseEl.value); if (h !== null) commit({ sunrise: h }); });
  sunsetEl.addEventListener("change", () => { const h = parseHour(sunsetEl.value); if (h !== null) commit({ sunset: h }); });
  tintEl.addEventListener("change", () => commit({ tint: tintEl.checked }));
  biomeEl.addEventListener("change", () => commit({ biome: biomeEl.value as ClockState["biome"] }));
  atmosphereEl.addEventListener("change", () => commit({ atmosphere: atmosphereEl.checked }));
  fogEl.addEventListener("change", () => commit({ fogEnabled: fogEl.checked }));
  raysEl.addEventListener("change", () => commit({ raysEnabled: raysEl.checked }));
  starsEl.addEventListener("change", () => commit({ starsEnabled: starsEl.checked }));
  strengthEl.addEventListener("input", () => {
    strengthValue.value = `${Math.round(Number(strengthEl.value) * 100)}%`;
    commitSoon({ strength: Number(strengthEl.value) });
  });
  layerEl.addEventListener("change", () => commit({ tintLayer: layerEl.value as TintLayer }));
  staggerEl.addEventListener("input", () => {
    staggerValue.value = `±${staggerEl.value} min`;
    commitSoon({ stagger: Number(staggerEl.value) });
  });

  OBR.scene.onMetadataChange((meta) => {
    clock = readClock(meta) ?? normalizeClock(null);
    refreshControls();
  });
  OBR.scene.onReadyChange(async (ready) => {
    sceneReady = ready;
    if (ready) clock = readClock(await OBR.scene.getMetadata()) ?? normalizeClock(null);
    refreshControls();
  });
  OBR.player.onChange((p) => { isGM = p.role === "GM"; refreshControls(); });

  refreshControls();
  tick();
  window.setInterval(tick, 500);
}

OBR.onReady(async () => {
  render();
  isGM = (await OBR.player.getRole()) === "GM";
  sceneReady = await OBR.scene.isReady();
  if (sceneReady) clock = readClock(await OBR.scene.getMetadata()) ?? normalizeClock(null);
  wire();
});