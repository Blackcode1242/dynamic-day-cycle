import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { hourOfDay, readClock, tintHex, moonIllumination, isDayAt } from "./clock";
import type { ClockState } from "./clock";

const EXTENSION_ID = "com.example.dynamic-day-cycle";
const TAG = `${EXTENSION_ID}/tint`;
const ATMOS_TAG = `${EXTENSION_ID}/atmosphere`;
let clock: ClockState | null = null;
let tintId: string | null = null;
let atmosId: string | null = null;
let lastHex = "", lastGeo = "", lastAtmos = "", lastAtmosGeo = "";
let unsubscribers: Array<() => void> = [];
let timer: number | undefined;
let running = false, again = false;

const TINT_SKSL = `uniform vec3 tint; half4 main(float2 coord) { return half4(tint, 1.0); }`;

// Shader Atmosférico Corrigido e Otimizado (sem sobreposição preta)
const ATMOS_SKSL = `
uniform float hour;
uniform float sunrise;
uniform float sunset;
uniform float moon;
uniform float night;
uniform float enabled;
uniform float fogOn;
uniform float raysOn;
uniform float starsOn;

half4 main(float2 coord) {
  if (enabled < 0.5) return half4(0.0);
  vec2 p = coord / size;
  
  float morning = (1.0 - smoothstep(sunrise + 0.2, sunrise + 2.6, hour)) * smoothstep(sunrise - 1.0, sunrise + 0.2, hour);
  float evening = smoothstep(sunset - 2.4, sunset - 0.3, hour) * (1.0 - smoothstep(sunset + 0.3, sunset + 1.4, hour));
  
  // Neblina
  float mistAlpha = morning * 0.12 * fogOn;
  
  // Raios
  float rayAxis = mix(p.x * 0.72 + p.y * 0.28, p.x * -0.48 + p.y * 0.88, step(0.001, evening));
  float rayBands = pow(max(0.0, sin(rayAxis * 18.0 + 0.5)), 7.0);
  float raysAlpha = max(morning, evening) * rayBands * 0.10 * raysOn;
  
  // Estrelas
  vec2 cell = floor(coord / 34.0);
  float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.986, rnd) * (0.45 + 0.55 * sin((hour * 6.283 + rnd * 80.0)));
  float starAlpha = star * night * (0.08 + moon * 0.10) * starsOn;
  
  float alpha = clamp(mistAlpha + raysAlpha + starAlpha, 0.0, 0.6);
  if (alpha <= 0.001) return half4(0.0);
  
  vec3 color = vec3(0.85, 0.90, 1.0);
  color = mix(color, vec3(1.0, 0.70, 0.40), raysAlpha / max(alpha, 0.001));
  color = mix(color, vec3(0.70, 0.80, 1.0), starAlpha / max(alpha, 0.001));
  
  return half4(color * alpha, alpha);
}`;

function rgbUniform(hex: string) {
  return { name: "tint", value: { x: parseInt(hex.slice(0, 2), 16) / 255, y: parseInt(hex.slice(2, 4), 16) / 255, z: parseInt(hex.slice(4, 6), 16) / 255 } };
}

async function coverage() {
  const PAD = 1500;
  try {
    let items = await OBR.scene.items.getItems((i: Item) => i.layer === "MAP");
    if (!items.length) items = await OBR.scene.items.getItems();
    if (items.length) {
      const b = await OBR.scene.items.getItemBounds(items.map(i => i.id));
      return { x: b.min.x - PAD, y: b.min.y - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
    }
  } catch { /* fallback */ }
  return { x: -10000, y: -10000, width: 20000, height: 20000 };
}

async function removeTagged(tag: string) {
  const locals = await OBR.scene.local.getItems((i: Item) => typeof i.metadata[tag] !== "undefined");
  if (locals.length) await OBR.scene.local.deleteItems(locals.map(i => i.id));
}
async function removeTint() { await removeTagged(TAG); tintId = null; lastHex = ""; lastGeo = ""; }
async function removeAtmos() { await removeTagged(ATMOS_TAG); atmosId = null; lastAtmos = ""; lastAtmosGeo = ""; }

async function apply() {
  if (!clock || !clock.enabled) {
    if (tintId || lastHex) await removeTint();
    if (atmosId || lastAtmos) await removeAtmos();
    return;
  }
  const h = hourOfDay(clock), hex = tintHex(h, clock), geo = await coverage();
  const geoSig = JSON.stringify([geo, clock.tintLayer]);
  
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

  if (!clock.atmosphere) { if (atmosId || lastAtmos) await removeAtmos(); return; }
  const atmosSig = JSON.stringify([geoSig, Math.round(h * 20) / 20, clock.sunrise, clock.sunset, moonIllumination(clock), clock.fogEnabled, clock.raysEnabled, clock.starsEnabled]);
  if (atmosId) {
    const found = await OBR.scene.local.getItems([atmosId]);
    if (!found.length) { atmosId = null; lastAtmos = ""; }
  }
  const night = isDayAt(h, clock) ? 0 : (h >= clock.sunset ? Math.min(1, (h - clock.sunset) / 1.5) : h < clock.sunrise ? Math.min(1, (clock.sunrise - h) / 1.5) : 0);
  const uniforms = [
    { name: "hour", value: h }, { name: "sunrise", value: clock.sunrise },
    { name: "sunset", value: clock.sunset }, { name: "moon", value: moonIllumination(clock) },
    { name: "night", value: night }, { name: "enabled", value: 1 },
    { name: "fogOn", value: clock.fogEnabled ? 1 : 0 },
    { name: "raysOn", value: clock.raysEnabled ? 1 : 0 },
    { name: "starsOn", value: clock.starsEnabled ? 1 : 0 }
  ];

  if (!atmosId || lastAtmosGeo !== geoSig) {
    if (atmosId) await removeAtmos();
    const effect = buildEffect().effectType("STANDALONE").width(geo.width).height(geo.height)
      .position({ x: geo.x, y: geo.y }).layer(clock.tintLayer).blendMode("SCREEN")
      .locked(true).disableHit(true).zIndex(1).uniforms(uniforms).sksl(ATMOS_SKSL)
      .metadata({ [ATMOS_TAG]: true }).build();
    await OBR.scene.local.addItems([effect]); atmosId = effect.id; lastAtmosGeo = geoSig;
  } else {
    await OBR.scene.local.updateItems([atmosId], drafts => { for (const d of drafts) (d as any).uniforms = uniforms; });
  }
  lastAtmos = atmosSig;
}

function queueApply() {
  if (running) { again = true; return; }
  running = true;
  (async () => { try { do { again = false; try { await apply(); } catch (e) { console.error("Dynamic Day Cycle: falha ao aplicar ambientação", e); } } while (again); } finally { running = false; } })();
}
function start() {
  stop();
  unsubscribers = [
    OBR.scene.onMetadataChange(meta => { clock = readClock(meta); queueApply(); }),
    OBR.scene.items.onChange(() => queueApply())
  ];
  OBR.scene.getMetadata().then(meta => { clock = readClock(meta); queueApply(); }).catch(queueApply);
  timer = window.setInterval(queueApply, 1000);
}
function stop() {
  for (const u of unsubscribers) u(); unsubscribers = [];
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
  clock = null; tintId = null; atmosId = null; lastHex = "", lastGeo = "", lastAtmos = "", lastAtmosGeo = "";
}
OBR.onReady(async () => {
  OBR.scene.onReadyChange(ready => ready ? start() : stop());
  if (await OBR.scene.isReady()) start();
});