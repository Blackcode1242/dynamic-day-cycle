import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { RAY_COLORS, fogAmount, hourOfDay, raysState, readClock, starsAmount, sunVector, tintHex } from "./clock";
import type { ClockState } from "./clock";

type Geo = { x: number; y: number; width: number; height: number };
type Uniform = { name: string; value: number | { x: number; y: number } | { x: number; y: number; z: number } };

const EXTENSION_ID = "com.example.dynamic-day-cycle";
const TAG = `${EXTENSION_ID}/tint`;

let clock: ClockState | null = null;
let tintId: string | null = null;
let lastHex = "", lastGeo = "";
let unsubscribers: Array<() => void> = [];
let timer: number | undefined;
let running = false, again = false;

const TINT_SKSL = `uniform vec3 tint; half4 main(float2 coord) { return half4(tint, 1.0); }`;

/* ---------- Efeitos ambientais (neblina, raios de luz, estrelas) ----------
 * Cada um é um efeito local próprio, criado só enquanto tem intensidade > 0 (para não gastar GPU à toa).
 * Todos usam as coordenadas locais do efeito (0..largura, 0..altura) e o uniform nativo `time`. */
const NOISE = `
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

// Neblina: ruído suave que flutua devagar; branco com transparência (SRC_OVER).
const FOG_SKSL = `
uniform vec2 origin; uniform float amount; uniform float time;
${NOISE}
half4 main(float2 coord) {
  vec2 p = (coord + origin) / 700.0;
  vec2 drift = vec2(time * 0.012, time * 0.005);
  float n = 0.5 * vnoise(p + drift) + 0.3 * vnoise(p * 2.1 - drift * 1.6 + 7.3) + 0.2 * vnoise(p * 4.3 + drift * 0.7 + 3.1);
  float density = smoothstep(0.25, 0.85, n);
  float a = clamp(amount * (0.35 + 0.65 * density), 0.0, 1.0);
  return half4(vec3(0.94, 0.96, 1.0) * a, a);
}`;

// Raios: gradiente que parte do lado do sol + feixes finos que se abrem a partir dele. Somado à imagem (SCREEN).
const RAYS_SKSL = `
uniform vec2 mapSize; uniform vec2 sunDir; uniform vec3 rayColor; uniform float amount; uniform float time;
half4 main(float2 coord) {
  vec2 center = mapSize * 0.5;
  vec2 rel = coord - center;
  float extent = abs(sunDir.x) * center.x + abs(sunDir.y) * center.y;
  float t = dot(rel, sunDir) / extent;
  float g = smoothstep(-0.55, 1.0, t);
  g = g * g;
  vec2 v = coord - (center + sunDir * extent * 2.4);
  float ang = atan(v.y, v.x);
  float s = 0.55 * sin(ang * 34.0 + time * 0.10) + 0.45 * sin(ang * 79.0 - time * 0.07 + 1.7);
  float streak = smoothstep(-0.5, 0.9, s);
  float fall = clamp(1.0 - length(v) / (extent * 3.8), 0.0, 1.0);
  float k = clamp(amount * (0.55 * g + 0.6 * g * streak * fall), 0.0, 1.0);
  return half4(rayColor * k, k);
}`;

// Estrelas: uma por célula de 150px (posição/tamanho/brilho sorteados por célula, então ficam fixas no mapa) e cintilam com o tempo.
const STARS_SKSL = `
uniform vec2 origin; uniform float amount; uniform float density; uniform float time;
${NOISE}
half4 main(float2 coord) {
  vec2 w = coord + origin;
  float cell = 150.0;
  vec2 id = floor(w / cell);
  if (h21(id) > density) return half4(0.0);
  vec2 sp = vec2(0.2) + 0.6 * vec2(h21(id + 17.3), h21(id + 41.7));
  float rad = 4.5 + 6.0 * h21(id + 5.1);
  float d = length(w - (id + sp) * cell);
  if (d > rad * 3.2) return half4(0.0);
  float core = 1.0 - smoothstep(0.0, rad, d);
  float glow = 1.0 - smoothstep(0.0, rad * 3.2, d);
  float tw = 0.6 + 0.4 * sin(time * (1.0 + 2.5 * h21(id + 9.9)) + 6.2831 * h21(id + 3.3));
  float b = clamp((core + 0.35 * glow * glow) * tw * amount * (0.5 + 0.5 * h21(id + 8.8)), 0.0, 1.0);
  vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.93, 0.8), h21(id + 2.2));
  return half4(col * b, b);
}`;

const f1 = (name: string, v: number): Uniform => ({ name, value: Math.round(v * 100) / 100 });
const f2 = (name: string, x: number, y: number): Uniform => ({ name, value: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } });
const f3 = (name: string, x: number, y: number, z: number): Uniform => ({ name, value: { x, y, z } });

type FxDef = {
  name: string; sksl: string; blend: "SRC_OVER" | "SCREEN"; z: number;
  // Devolve os uniforms ou null quando o efeito deve estar ausente (desligado ou sem intensidade).
  uniforms: (h: number, c: ClockState, geo: Geo) => Uniform[] | null;
};

const FX: FxDef[] = [
  {
    name: "rays", sksl: RAYS_SKSL, blend: "SCREEN", z: 1,
    uniforms: (h, c, geo) => {
      if (!c.rays) return null;
      const r = raysState(h, c), amount = r.amount * c.raysStrength * 0.5;
      if (amount < 0.01) return null;
      const [dx, dy] = sunVector(c, r.dusk), [cr, cg, cb] = RAY_COLORS[r.dusk ? "dusk" : "dawn"];
      return [f2("mapSize", geo.width, geo.height), f2("sunDir", dx, dy), f3("rayColor", cr / 255, cg / 255, cb / 255), f1("amount", amount)];
    }
  },
  {
    name: "fog", sksl: FOG_SKSL, blend: "SRC_OVER", z: 2,
    uniforms: (h, c, geo) => {
      if (!c.fog) return null;
      const amount = fogAmount(h, c) * c.fogStrength * 0.8;
      return amount < 0.01 ? null : [f2("origin", geo.x, geo.y), f1("amount", amount)];
    }
  },
  {
    name: "stars", sksl: STARS_SKSL, blend: "SRC_OVER", z: 3,
    uniforms: (h, c, geo) => {
      if (!c.stars) return null;
      const amount = starsAmount(h, c);
      return amount < 0.02 ? null : [f2("origin", geo.x, geo.y), f1("amount", amount), f1("density", c.starsDensity * 0.8)];
    }
  }
];

const fxState = new Map<string, { id: string; sig: string; geo: string }>();
const fxTag = (name: string) => `${EXTENSION_ID}/fx-${name}`;

async function removeFx(name: string) { await removeTagged(fxTag(name)); fxState.delete(name); }
async function removeAllFx() { for (const def of FX) await removeFx(def.name); fxState.clear(); }

async function applyFx(h: number, geo: Geo, geoSig: string) {
  for (const def of FX) {
    const st = fxState.get(def.name);
    const uniforms = clock && clock.enabled && clock.fx ? def.uniforms(h, clock, geo) : null;
    if (!uniforms) { if (st) await removeFx(def.name); continue; }

    const sig = JSON.stringify(uniforms);
    if (st) { // o item pode ter sido apagado por fora
      const found = await OBR.scene.local.getItems([st.id]);
      if (!found.length) fxState.delete(def.name);
    }
    const cur = fxState.get(def.name);
    if (!cur || cur.geo !== geoSig) {
      if (cur) await removeFx(def.name);
      const effect = buildEffect().effectType("STANDALONE").width(geo.width).height(geo.height)
        .position({ x: geo.x, y: geo.y }).layer(clock!.tintLayer).blendMode(def.blend)
        .locked(true).disableHit(true).zIndex(def.z).uniforms(uniforms).sksl(def.sksl)
        .metadata({ [fxTag(def.name)]: true }).build();
      await OBR.scene.local.addItems([effect]);
      fxState.set(def.name, { id: effect.id, sig, geo: geoSig });
    } else if (cur.sig !== sig) {
      await OBR.scene.local.updateItems([cur.id], drafts => { for (const d of drafts) (d as any).uniforms = uniforms; });
      cur.sig = sig;
    }
  }
}

function rgbUniform(hex: string) {
  return { name: "tint", value: { x: parseInt(hex.slice(0, 2), 16) / 255, y: parseInt(hex.slice(2, 4), 16) / 255, z: parseInt(hex.slice(4, 6), 16) / 255 } };
}

async function getMapBounds() {
  const PAD = 50;
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

async function apply() {
  if (!clock || !clock.enabled) {
    if (tintId || lastHex) await removeTint();
    if (fxState.size) await removeAllFx();
    return;
  }

  const h = hourOfDay(clock), hex = tintHex(h, clock), geo = await getMapBounds();
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

  await applyFx(h, geo, geoSig);
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
  timer = window.setInterval(queueApply, 1000);
}

function stop() {
  for (const u of unsubscribers) u(); unsubscribers = [];
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
  clock = null; tintId = null; lastHex = ""; lastGeo = ""; fxState.clear();
}

OBR.onReady(async () => {
  OBR.scene.onReadyChange(ready => ready ? start() : stop());
  if (await OBR.scene.isReady()) start();
});