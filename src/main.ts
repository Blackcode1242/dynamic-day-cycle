import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  PHASE_LABELS, SPEEDS, formatHour, gameSeconds, hourOfDay, normalizeClock, parseHour, phaseAt, readClock, tintHex, CLOCK_KEY,
  MOON_PHASES, moonIllumination, moonOffsetFor, moonPhaseIndex
} from "./clock";
import type { ClockState, SunSide, TintLayer } from "./clock";

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
        <h1>Dynamic <span>Day Cycle</span></h1>
      </header>

      <nav class="tabs">
        <button class="tab-btn active" data-tab="tab-clock">⏱ Relógio</button>
        <button class="tab-btn" data-tab="tab-filter">🎨 Filtros & Cenário</button>
        <button class="tab-btn" data-tab="tab-fx">🌫 Ambiente</button>
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

        <!-- ABA 2: FILTROS E CENÁRIO -->
        <div id="tab-filter" class="tab-content" hidden>
          <label for="biome">Perfil de cenário</label>
          <select id="biome">
            <option value="urban">Neutro</option>
            <option value="desert">Deserto</option>
            <option value="forest">Floresta</option>
            <option value="snow">Neve</option>
          </select>

          <label for="strength">Intensidade do filtro <output id="strengthValue"></output></label>
          <input id="strength" type="range" min="0.2" max="1.0" step="0.05" />

          <label for="tintLayer">O filtro cobre</label>
          <select id="tintLayer">
            <option value="DRAWING">Só o mapa (tokens livres)</option>
            <option value="ATTACHMENT">Mapa e tokens</option>
          </select>

          <label for="stagger">Variação das luzes <output id="staggerValue"></output></label>
          <input id="stagger" type="range" min="0" max="90" step="5" />

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

        <!-- ABA 3: EFEITOS AMBIENTAIS -->
        <div id="tab-fx" class="tab-content" hidden>
          <label class="switch">
            <input id="fx" type="checkbox" />
            <span class="track"></span>
            <span class="switch-text">Efeitos ambientais</span>
          </label>

          <div class="card">
            <label class="switch">
              <input id="fog" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">🌫 Neblina</span>
            </label>
            <p class="hint small">Camada branca suave que surge perto do amanhecer e some até o meio da manhã.</p>
            <label for="fogStrength">Intensidade <output id="fogStrengthValue"></output></label>
            <input id="fogStrength" type="range" min="0.1" max="1" step="0.05" />
          </div>

          <div class="card">
            <label class="switch">
              <input id="rays" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">🌅 Raios de luz</span>
            </label>
            <p class="hint small">Perto do nascer e do pôr do sol, um gradiente direcional dá a sensação de sol baixo.</p>
            <label for="raysStrength">Intensidade <output id="raysStrengthValue"></output></label>
            <input id="raysStrength" type="range" min="0.1" max="1" step="0.05" />
            <label for="sunSide">O sol nasce</label>
            <select id="sunSide">
              <option value="E">À direita (pôr à esquerda)</option>
              <option value="W">À esquerda (pôr à direita)</option>
              <option value="N">Em cima (pôr embaixo)</option>
              <option value="S">Embaixo (pôr em cima)</option>
            </select>
          </div>

          <div class="card">
            <label class="switch">
              <input id="stars" type="checkbox" />
              <span class="track"></span>
              <span class="switch-text">✨ Estrelas</span>
            </label>
            <p class="hint small">À noite surgem pontinhos cintilantes. Na lua cheia, ficam um pouco mais apagadas.</p>
            <label for="starsDensity">Quantidade <output id="starsDensityValue"></output></label>
            <input id="starsDensity" type="range" min="0.1" max="1" step="0.05" />
          </div>

          <div class="card">
            <div class="moonrow">
              <div class="moonicon" id="moonIcon">🌑</div>
              <div>
                <div class="moonname" id="moonName">--</div>
                <div class="hint small" id="moonLight"></div>
              </div>
            </div>
            <label for="moonPhase">Fase da lua agora</label>
            <select id="moonPhase">
              ${MOON_PHASES.map((m, i) => `<option value="${i}">${m.emoji} ${m.label}</option>`).join("")}
            </select>
            <label for="moonInfluence">Influência da lua no filtro <output id="moonInfluenceValue"></output></label>
            <input id="moonInfluence" type="range" min="0" max="1.5" step="0.05" />
            <p class="hint small">À noite, a lua cheia clareia o filtro e a lua nova o deixa mais escuro. A fase avança sozinha com os dias do jogo.</p>
          </div>
        </div>
      </section>
      <footer>Dynamic Day Cycle v0.3.0</footer>
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
  const strengthEl = $<HTMLInputElement>("#strength");
  const strengthValue = $<HTMLOutputElement>("#strengthValue");
  const layerEl = $<HTMLSelectElement>("#tintLayer");
  const staggerEl = $<HTMLInputElement>("#stagger");
  const staggerValue = $<HTMLOutputElement>("#staggerValue");
  const biomeEl = $<HTMLSelectElement>("#biome");
  const moonInfoEl = $<HTMLElement>("#moonInfo");
  const fxEl = $<HTMLInputElement>("#fx");
  const fogEl = $<HTMLInputElement>("#fog");
  const raysEl = $<HTMLInputElement>("#rays");
  const starsEl = $<HTMLInputElement>("#stars");
  const sunSideEl = $<HTMLSelectElement>("#sunSide");
  const moonPhaseEl = $<HTMLSelectElement>("#moonPhase");
  const moonIconEl = $<HTMLElement>("#moonIcon");
  const moonNameEl = $<HTMLElement>("#moonName");
  const moonLightEl = $<HTMLElement>("#moonLight");
  // Sliders da aba Ambiente: [chave no estado, formato do valor exibido]
  const fxSliders: Array<[keyof ClockState, (v: number) => string]> = [
    ["fogStrength", (v) => `${Math.round(v * 100)}%`],
    ["raysStrength", (v) => `${Math.round(v * 100)}%`],
    ["starsDensity", (v) => `${Math.round(v * 100)}%`],
    ["moonInfluence", (v) => `${Math.round(v * 100)}%`]
  ];
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
    strengthEl.value = String(clock.strength);
    strengthValue.value = `${Math.round(clock.strength * 100)}%`;
    layerEl.value = clock.tintLayer;
    staggerEl.value = String(clock.stagger);
    biomeEl.value = clock.biome;
    staggerValue.value = `±${clock.stagger} min`;
    fxEl.checked = clock.fx; fogEl.checked = clock.fog; raysEl.checked = clock.rays; starsEl.checked = clock.stars;
    sunSideEl.value = clock.sunSide;
    for (const [key, fmt] of fxSliders) {
      const input = $<HTMLInputElement>(`#${key}`);
      if (document.activeElement !== input) input.value = String(clock[key]);
      $<HTMLOutputElement>(`#${key}Value`).value = fmt(Number(clock[key]));
    }
    if (document.activeElement !== moonPhaseEl) moonPhaseEl.value = String(moonPhaseIndex(clock));
    if (document.activeElement !== sunriseEl) sunriseEl.value = formatHour(clock.sunrise);
    if (document.activeElement !== sunsetEl) sunsetEl.value = formatHour(clock.sunset);
    toggleEl.textContent = clock.running ? "⏸ Pausar" : "▶ Iniciar";
    const lock = !isGM || !sceneReady;
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) {
      if (el !== enabledEl) el.disabled = lock;
    }
    roMsg.hidden = isGM || !sceneReady;
    noScene.hidden = sceneReady;
  }

  function tick() {
    const h = hourOfDay(clock);
    timeEl.textContent = formatHour(h);
    phaseEl.textContent = clock.enabled ? PHASE_LABELS[phaseAt(h, clock)] : "Ciclo desligado";
    swatchEl.style.background = `#${tintHex(h, clock)}`;
    const moon = MOON_PHASES[moonPhaseIndex(clock)];
    moonInfoEl.textContent = `Lua: ${moon.label}`;
    moonIconEl.textContent = moon.emoji;
    moonNameEl.textContent = moon.label;
    moonLightEl.textContent = `${Math.round(moonIllumination(clock) * 100)}% iluminada`;
    if (document.activeElement !== moonPhaseEl) moonPhaseEl.value = String(moonPhaseIndex(clock));
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
  // Anoitecer ajustado para o pôr do sol + 1 hora
  $("#toDusk").addEventListener("click", () => {
    const now = gameSeconds(clock), day = Math.floor(now / 86400);
    const target = day * 86400 + (clock.sunset + 1) * 3600;
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
  biomeEl.addEventListener("change", () => commit({ biome: biomeEl.value as ClockState["biome"] }));
  strengthEl.addEventListener("input", () => {
    strengthValue.value = `${Math.round(Number(strengthEl.value) * 100)}%`;
    commitSoon({ strength: Number(strengthEl.value) });
  });
  layerEl.addEventListener("change", () => commit({ tintLayer: layerEl.value as TintLayer }));
  staggerEl.addEventListener("input", () => {
    staggerValue.value = `±${staggerEl.value} min`;
    commitSoon({ stagger: Number(staggerEl.value) });
  });

  // Aba Ambiente
  for (const [el, key] of [[fxEl, "fx"], [fogEl, "fog"], [raysEl, "rays"], [starsEl, "stars"]] as const) {
    el.addEventListener("change", () => commit({ [key]: el.checked }));
  }
  sunSideEl.addEventListener("change", () => commit({ sunSide: sunSideEl.value as SunSide }));
  for (const [key, fmt] of fxSliders) {
    const input = $<HTMLInputElement>(`#${key}`);
    input.addEventListener("input", () => {
      $<HTMLOutputElement>(`#${key}Value`).value = fmt(Number(input.value));
      commitSoon({ [key]: Number(input.value) });
    });
  }
  moonPhaseEl.addEventListener("change", () => {
    const phase = MOON_PHASES[Number(moonPhaseEl.value)];
    if (phase) commit({ moonOffset: moonOffsetFor(clock, phase.age) });
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