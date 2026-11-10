export const CLOCK_KEY = "com.example.dynamic-day-cycle/state";

export type TintLayer = "DRAWING" | "ATTACHMENT";
export type Schedule = "always" | "night" | "day";
export type Biome = "urban" | "desert" | "forest" | "snow" | "swamp";
// Lado do mapa de onde o sol nasce (o pôr do sol vem do lado oposto). E = direita, W = esquerda, N = cima, S = baixo.
export type SunSide = "E" | "W" | "N" | "S";

export type ClockState = {
  enabled: boolean;
  running: boolean;
  speed: number;
  anchorReal: number;
  anchorGame: number;
  sunrise: number;
  sunset: number;
  tint: boolean;
  strength: number;
  tintLayer: TintLayer;
  stagger: number;
  biome: Biome;
  moonOffset: number;
  // Efeitos ambientais
  fx: boolean;
  fog: boolean; fogStrength: number;
  rays: boolean; raysStrength: number; sunSide: SunSide;
  stars: boolean; starsDensity: number;
  moonInfluence: number;
};

export const DEFAULT_CLOCK: ClockState = {
  enabled: false, running: false, speed: 60, anchorReal: 0,
  anchorGame: 12 * 3600, sunrise: 6, sunset: 18,
  tint: true, strength: 0.9, tintLayer: "DRAWING", stagger: 20,
  biome: "urban", moonOffset: 14,
  fx: true,
  fog: true, fogStrength: 0.6,
  rays: true, raysStrength: 0.7, sunSide: "E",
  stars: true, starsDensity: 0.5,
  moonInfluence: 1
};

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8, 16, 32, 60, 64, 120, 240, 720];

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeClock(raw: unknown): ClockState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CLOCK;
  const validBiomes: Biome[] = ["urban", "desert", "forest", "snow", "swamp"];
  const biome = validBiomes.includes(String(r.biome) as Biome) ? (r.biome as Biome) : d.biome;
  const sunSide = (["E", "W", "N", "S"] as SunSide[]).includes(r.sunSide as SunSide) ? (r.sunSide as SunSide) : d.sunSide;

  return {
    enabled: r.enabled === true, running: r.running === true,
    speed: num(r.speed, d.speed, 0.01, 5000),
    anchorReal: num(r.anchorReal, d.anchorReal, 0, 8.64e15),
    anchorGame: num(r.anchorGame, d.anchorGame, -1e12, 1e12),
    sunrise: num(r.sunrise, d.sunrise, 3, 10), sunset: num(r.sunset, d.sunset, 15, 22),
    tint: r.tint !== false, strength: num(r.strength, d.strength, 0.2, 1.0),
    tintLayer: r.tintLayer === "ATTACHMENT" ? "ATTACHMENT" : "DRAWING",
    stagger: num(r.stagger, d.stagger, 0, 90), biome,
    moonOffset: num(r.moonOffset, d.moonOffset, 0, 29.53),
    fx: r.fx !== false,
    fog: r.fog !== false, fogStrength: num(r.fogStrength, d.fogStrength, 0.1, 1),
    rays: r.rays !== false, raysStrength: num(r.raysStrength, d.raysStrength, 0.1, 1), sunSide,
    stars: r.stars !== false, starsDensity: num(r.starsDensity, d.starsDensity, 0.1, 1),
    moonInfluence: num(r.moonInfluence, d.moonInfluence, 0, 1.5)
  };
}

export function readClock(meta: Record<string, unknown> | undefined | null): ClockState | null {
  const raw = meta?.[CLOCK_KEY];
  return raw && typeof raw === "object" ? normalizeClock(raw) : null;
}
export function gameSeconds(c: ClockState, now = Date.now()) {
  return c.running ? c.anchorGame + ((now - c.anchorReal) / 1000) * c.speed : c.anchorGame;
}
export function hourOfDay(c: ClockState, now = Date.now()) {
  const h = (gameSeconds(c, now) / 3600) % 24;
  return h < 0 ? h + 24 : h;
}
export function formatHour(h: number) {
  const total = Math.floor(h * 60), hh = Math.floor(total / 60) % 24, mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export function parseHour(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h + min / 60 : null;
}
export function isDayAt(h: number, c: ClockState) { return h >= c.sunrise && h < c.sunset; }
export type Phase = "dawn" | "day" | "dusk" | "night";
export const PHASE_LABELS: Record<Phase, string> = { dawn: "Amanhecer", day: "Dia", dusk: "Entardecer", night: "Noite" };
export function phaseAt(h: number, c: ClockState): Phase {
  if (h >= c.sunrise - 1 && h < c.sunrise + 1) return "dawn";
  if (h >= c.sunrise + 1 && h < c.sunset - 1) return "day";
  if (h >= c.sunset - 1 && h < c.sunset + 1) return "dusk";
  return "night";
}
function hashId(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return h;
}
export function staggerHours(id: string, staggerMinutes: number) {
  const u = ((hashId(id) >>> 0) % 2001) / 1000 - 1;
  return (u * staggerMinutes) / 60;
}
export function lightIsOn(id: string, schedule: Schedule, c: ClockState | null, now = Date.now()) {
  if (!c || !c.enabled || schedule === "always") return true;
  let h = hourOfDay(c, now) - staggerHours(id, c.stagger);
  h = ((h % 24) + 24) % 24;
  const day = isDayAt(h, c);
  return schedule === "night" ? !day : day;
}

export function moonAge(c: ClockState, now = Date.now()) {
  const days = gameSeconds(c, now) / 86400;
  return ((days + c.moonOffset) % 29.53 + 29.53) % 29.53;
}
export function moonIllumination(c: ClockState, now = Date.now()) {
  const phase = moonAge(c, now) / 29.53;
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}
export const MOON_PHASES = [
  { label: "Lua nova", emoji: "🌑", age: 0 },
  { label: "Lua crescente", emoji: "🌒", age: 3.7 },
  { label: "Quarto crescente", emoji: "🌓", age: 7.4 },
  { label: "Gibosa crescente", emoji: "🌔", age: 11.1 },
  { label: "Lua cheia", emoji: "🌕", age: 14.8 },
  { label: "Gibosa minguante", emoji: "🌖", age: 18.5 },
  { label: "Quarto minguante", emoji: "🌗", age: 22.2 },
  { label: "Lua minguante", emoji: "🌘", age: 25.9 }
] as const;
export function moonPhaseIndex(c: ClockState, now = Date.now()) {
  const age = moonAge(c, now);
  if (age < 1.85 || age > 27.68) return 0;
  if (age < 5.55) return 1;
  if (age < 9.25) return 2;
  if (age < 12.95) return 3;
  if (age < 16.65) return 4;
  if (age < 20.35) return 5;
  if (age < 24.05) return 6;
  return 7;
}
export function moonLabel(c: ClockState, now = Date.now()) { return MOON_PHASES[moonPhaseIndex(c, now)].label; }
// Offset que faz a lua estar na idade `age` (dias) no momento atual do jogo.
export function moonOffsetFor(c: ClockState, age: number, now = Date.now()) {
  const days = gameSeconds(c, now) / 86400;
  return (((age - days) % 29.53) + 29.53) % 29.53;
}

type Rgb = [number, number, number];
// Paletas com cores mais profundas e marcantes para cada bioma
const PALETTES: Record<Biome, { night: Rgb; predawn: Rgb; dawn: Rgb; day: Rgb; dusk: Rgb; twilight: Rgb }> = {
  urban: { night: [35, 50, 80], predawn: [90, 105, 135], dawn: [220, 190, 160], day: [255, 255, 255], dusk: [210, 150, 110], twilight: [70, 80, 110] },
  desert: { night: [50, 65, 120], predawn: [110, 120, 170], dawn: [255, 170, 110], day: [255, 235, 200], dusk: [255, 130, 70], twilight: [100, 80, 140] },
  forest: { night: [30, 60, 100], predawn: [80, 120, 140], dawn: [160, 200, 130], day: [210, 240, 200], dusk: [190, 130, 90], twilight: [60, 90, 120] },
  snow: { night: [60, 90, 150], predawn: [130, 160, 200], dawn: [210, 190, 180], day: [230, 245, 255], dusk: [200, 140, 130], twilight: [90, 120, 170] },
  swamp: { night: [35, 70, 60], predawn: [80, 130, 100], dawn: [170, 180, 90], day: [200, 220, 170], dusk: [160, 110, 60], twilight: [60, 90, 70] }
};

function keyframes(c: ClockState): { h: number; rgb: Rgb }[] {
  const p = PALETTES[c.biome], wrap = (h: number) => ((h % 24) + 24) % 24;
  return [
    { h: c.sunrise - 1.5, rgb: p.night }, { h: c.sunrise - 0.5, rgb: p.predawn },
    { h: c.sunrise, rgb: p.dawn }, { h: c.sunrise + 1.5, rgb: p.day },
    { h: c.sunset - 1.5, rgb: p.day }, { h: c.sunset, rgb: p.dusk },
    { h: c.sunset + 0.75, rgb: p.twilight }, { h: c.sunset + 1.75, rgb: p.night }
  ].map(k => ({ h: wrap(k.h), rgb: k.rgb })).sort((a, b) => a.h - b.h);
}

export function tintHex(h: number, c: ClockState): string {
  const keys = keyframes(c);
  let a = keys[keys.length - 1], b = keys[0];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].h > h) { b = keys[i]; a = keys[(i + keys.length - 1) % keys.length]; break; }
    if (i === keys.length - 1) { a = keys[i]; b = keys[0]; }
  }
  const span = ((b.h - a.h) + 24) % 24 || 24;
  const t = Math.min(1, Math.max(0, (((h - a.h) + 24) % 24) / span));
  // Lua cheia clareia o filtro à noite; lua nova deixa a noite um pouco mais escura que o normal.
  // A influência é proporcional à "noite" (0 de dia, 1 em plena noite), então muda suavemente no crepúsculo.
  const moonShift = nightness(h, c) * c.moonInfluence * (0.08 - 0.4 * moonIllumination(c));
  const strength = Math.min(0.95, Math.max(0.05, c.strength * (1 + moonShift)));
  
  return [0, 1, 2].map(i => {
    const v = a.rgb[i] + (b.rgb[i] - a.rgb[i]) * t;
    const adjusted = Math.round(255 - (255 - v) * strength);
    return Math.min(255, Math.max(20, adjusted)).toString(16).padStart(2, "0");
  }).join("");
}
/* ---------- Efeitos ambientais ---------- */

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Diferença de horas em (-12, 12], para comparar com nascer/pôr do sol atravessando a meia-noite.
const wrap12 = (x: number) => ((((x + 12) % 24) + 24) % 24) - 12;

/** 0 de dia, 1 em plena noite; sobe depois do pôr do sol e desce antes do nascer (acompanha as paletas do filtro). */
export function nightness(h: number, c: ClockState) {
  const r = (((h - c.sunset) % 24) + 24) % 24;
  const len = c.sunrise + 24 - c.sunset;
  return sstep(0.25, 1.75, r) * (1 - sstep(len - 1.5, len - 0.25, r));
}

/** Neblina: sobe antes do nascer do sol, fica densa no amanhecer e some até o meio da manhã (~3,5h depois). */
export function fogAmount(h: number, c: ClockState) {
  const rel = wrap12(h - c.sunrise);
  return sstep(-1.5, -0.5, rel) * (1 - sstep(0.75, 3.5, rel));
}

/** Raios de sol baixo: perto do nascer (de manhã) e do pôr (no fim da tarde). */
export function raysState(h: number, c: ClockState): { amount: number; dusk: boolean } {
  const rd = wrap12(h - c.sunrise), rs = wrap12(h - c.sunset);
  const dawn = sstep(-1, -0.25, rd) * (1 - sstep(0.75, 2.0, rd));
  const dusk = sstep(-2.0, -0.75, rs) * (1 - sstep(0.25, 1.0, rs));
  return dawn >= dusk ? { amount: dawn, dusk: false } : { amount: dusk, dusk: true };
}

const SIDE_VEC: Record<SunSide, [number, number]> = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
/** Vetor (coordenadas de tela, y para baixo) apontando para onde está o sol. */
export function sunVector(c: ClockState, dusk: boolean): [number, number] {
  const [x, y] = SIDE_VEC[c.sunSide];
  return dusk ? [-x, -y] : [x, y];
}
export const RAY_COLORS: Record<"dawn" | "dusk", Rgb> = { dawn: [255, 184, 107], dusk: [255, 128, 64] };

/** Estrelas: aparecem com a noite; a lua cheia apaga parte do brilho. */
export function starsAmount(h: number, c: ClockState, now = Date.now()) {
  const n = nightness(h, c);
  return n * n * (1 - 0.5 * moonIllumination(c, now) * Math.min(1, c.moonInfluence));
}
