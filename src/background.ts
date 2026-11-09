import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { hourOfDay, readClock, tintHex, moonIllumination } from "./clock";
import type { ClockState } from "./clock";

const EXTENSION_ID = "com.example.dynamic-day-cycle";
const TAG = `${EXTENSION_ID}/tint`;
const WEATHER_TAG = `${EXTENSION_ID}/weather`;

let clock: ClockState | null = null;
let tintId: string | null = null;
let weatherId: string | null = null;
let lastHex = "", lastGeo = "", lastWeather = "";
let unsubscribers: Array<() => void> = [];
let timer: number | undefined;
let running = false, again = false;

const TINT_SKSL = `uniform vec3 tint; half4 main(float2 coord) { return half4(tint, 1.0); }`;

// Shader Atmosférico limpo baseado no efeito selecionado (Weather)
const WEATHER_SKSL = `
uniform float type; // 1: fog, 2: rays, 3: stars, 4: rain
uniform float time;

half4 main(float2 coord) {
  vec2 p = coord / size;
  if (type < 0.5) return half4(0.0);

  // Neblina suave
  if (type < 1.5) {
    float n = sin(p.x * 10.0 + time * 0.5) * cos(p.y * 10.0 + time * 0.3);
    float alpha = 0.12 + 0.04 * n;
    return half4(0.85, 0.90, 0.95, alpha);
  }
  // Raios solares diagonais
  else if (type < 2.5) {
    float r = sin((p.x + p.y) * 15.0 - time * 1.5);
    float alpha = max(0.0, r) * 0.15;
    return half4(1.0, 0.85, 0.50, alpha);
  }
  // Noite estrelada
  else if (type < 3.5) {
    vec2 cell = floor(coord / 40.0);
    float rnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float star = step(0.97, rnd) * (0.5 + 0.5 * sin(time * 3.0 + rnd * 50.0));
    return half4(0.8, 0.9, 1.0, star * 0.6);
  }
  // Chuva sutil
  else {
    float rain = fract(p.y * 50.0 - time * 5.0 + p.x * 10.0);
    float drop = step(0.92, rain);
    return half4(0.7, 0.8, 0.9, drop * 0.25);
  }
}`;

function rgbUniform(hex: string) {
  return { name: "tint", value: { x: parseInt(hex.slice(0, 2), 16) / 255, y: parseInt(hex.slice(2, 4), 16) / 255, z: parseInt(hex.slice(4, 6), 16) / 255 } };
}

// Encontra estritamente os limites exatos do mapa para aplicar o filtro estilo Aurora
async function getMapBounds() {
  const PAD = 50; // Bem próximo às bordas reais do mapa
  try {
    const items = await OBR.scene.items.getItems((i: Item) => i.layer === "MAP");
    if (items.length) {
      const b = await OBR.scene.items.getItemBounds(items.map(i => i.id));
      return { x: b.min.x - PAD, y: b.min.y - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
    }
  } catch { /* fallback */ }
  return { x: -5000, y: -5000, width: 10000, height: 10000 };
}

async function removeTagged(tag: string) {
  const locals = await OBR.scene.local.getItems((i: Item) => typeof i.metadata[tag] !== "undefined");
  if (locals.length) await OBR.scene.local.deleteItems(locals.map(i => i.id));
}
async function removeTint() { await removeTagged(TAG); tintId = null; lastHex = ""; lastGeo = ""; }
async function removeWeather() { await removeTagged(WEATHER_TAG); weatherId = null; lastWeather = ""; }

async function apply() {
  if (!clock || !clock.enabled) {
    if (tintId || lastHex) await removeTint();
    if (weatherId || lastWeather) await removeWeather();
    return;
  }

  const h = hourOfDay(clock), hex = tintHex(h, clock), geo = await getMapBounds();
  const geoSig = JSON.stringify([geo, clock.tintLayer]);

  // 1. Filtro de Cor (Estilo Aurora cobrindo o mapa)
  if (!clock.tint || hex === "ffffff") {
    if (tintId || lastHex) await removeTint();
  } else {
    if (tintId) {
      const found = await OBR.scene.local.getItems([tintId]);
      if (!found.length) { tintId = null; lastHex = ""; lastGeo = ""; }
    }
    if (!tintId || geoSig !== lastGeo) {
      if (tintId) await removeTint();
      const effect = buildEffect().effectType("STANDALONE").width(geo.width).height(geo.height)
        .position({ x: geo.x, y: geo.y }).layer(clock.tintLayer).blendMode("MULTIPLY")
        .locked(true).disableHit(true).zIndex(0).uniforms([rgbUniform(hex)]).sksl(TINT_SKSL)
        .metadata({ [TAG]: true }).build();
      await OBR.scene.local.addItems([effect]); tintId = effect.id; lastHex = hex; lastGeo = geoSig;
    } else if (hex !== lastHex) {
      await OBR.scene.local.updateItems([tintId], drafts => { for (const d of drafts) (d as any).uniforms = [rgbUniform(hex)]; });
      lastHex = hex;
    }
  }

  // 2. Efeito de Clima Selecionável (Weather Style)
  const weatherMap: Record<string, number> = { none: 0, fog: 1, rays: 2, stars: 3, rain: 4 };
  const typeVal = weatherMap[clock.weather] || 0;

  if (typeVal === 0) {
    if (weatherId || lastWeather) await removeWeather();
  } else {
    const timeVal = Date.now() / 1000;
    const uniforms = [{ name: "type", value: typeVal }, { name: "time", value: timeVal }];

    if (weatherId) {
      const found = await OBR.scene.local.getItems([weatherId]);
      if (!found.length) weatherId = null;
    }

    if (!weatherId) {
      const effect = buildEffect().effectType("STANDALONE").width(geo.width).height(geo.height)
        .position({ x: geo.x, y: geo.y }).layer(clock.tintLayer).blendMode("SCREEN")
        .locked(true).disableHit(true).zIndex(1).uniforms(uniforms).sksl(WEATHER_SKSL)
        .metadata({ [WEATHER_TAG]: true }).build();
      await OBR.scene.local.addItems([effect]); weatherId = effect.id;
    } else {
      await OBR.scene.local.updateItems([weatherId], drafts => { for (const d of drafts) (d as any).uniforms = uniforms; });
    }
  }
}

function queueApply() {
  if (running) { again = true; return; }
  running = true;
  (async () => { try { do { again = false; try { await apply(); } catch (e) { console.error(e); } } while (again); } finally { running = false; } })();
}

function start() {
  stop();
  unsubscribers = [
    OBR.scene.onMetadataChange(meta => { clock = readClock(meta); queueApply(); }),
    OBR.scene.items.onChange(() => queueApply())
  ];
  OBR.scene.getMetadata().then(meta => { clock = readClock(meta); queueApply(); }).catch(queueApply);
  timer = window.setInterval(queueApply, 300); // Atualiza animação fluida do clima
}

function stop() {
  for (const u of unsubscribers) u(); unsubscribers = [];
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
  clock = null; tintId = null; weatherId = null; lastHex = ""; lastGeo = ""; lastWeather = "";
}

OBR.onReady(async () => {
  OBR.scene.onReadyChange(ready => ready ? start() : stop());
  if (await OBR.scene.isReady()) start();
});