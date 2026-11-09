// Contrato entre o Dynamic Day Cycle e o Dynamic Auras & Lights.
export const CLOCK_KEY = "com.example.dynamic-day-cycle/state";

export type TintLayer = "DRAWING" | "ATTACHMENT";
export type Schedule = "always" | "night" | "day";
export type Biome = "desert" | "forest" | "snow" | "swamp";

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
  atmosphere: boolean;
};

export const DEFAULT_CLOCK: ClockState = {
  enabled: false, running: false, speed: 60, anchorReal: 0,
  anchorGame: 12 * 3600, sunrise: 6, sunset: 18,
  tint: true, strength: 0.75, tintLayer: "DRAWING", stagger: 20,
  biome: "forest", moonOffset: 14, atmosphere: true
};

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8, 16, 32, 60, 64, 120, 240, 720];
function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeClock(raw: unknown): ClockState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CLOCK;
  const biome = ["desert", "forest", "snow", "swamp"].includes(String(r.biome)) ? r.biome as Biome : d.biome;
  return {
    enabled: r.enabled === true, running: r.running === true,
    speed: num(r.speed, d.speed, 0.01, 5000),
    anchorReal: num(r.anchorReal, d.anchorReal, 0, 8.64e15),
    anchorGame: num(r.anchorGame, d.anchorGame, -1e12, 1e12),
    sunrise: num(r.sunrise, d.sunrise, 3, 10), sunset: num(r.sunset, d.sunset, 15, 22),
    tint: r.tint !== false, strength: num(r.strength, d.strength, 0.1, 0.85),
    tintLayer: r.tintLayer === "ATTACHMENT" ? "ATTACHMENT" : "DRAWING",
    stagger: num(r.stagger, d.stagger, 0, 90), biome,
    moonOffset: num(r.moonOffset, d.moonOffset, 0, 29.53),
    atmosphere: r.atmosphere !== false
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
export function moonLabel(c: ClockState, now = Date.now()) {
  const age = moonAge(c, now);
  if (age < 1.85 || age > 27.68) return "Lua nova";
  if (age < 5.55) return "Lua crescente";
  if (age < 9.25) return "Quarto crescente";
  if (age < 12.95) return "Gibosa crescente";
  if (age < 16.65) return "Lua cheia";
  if (age < 20.35) return "Gibosa minguante";
  if (age < 24.05) return "Quarto minguante";
  return "Lua minguante";
}

type Rgb = [number, number, number];
const PALETTES: Record<Biome, { night: Rgb; predawn: Rgb; dawn: Rgb; day: Rgb; dusk: Rgb; twilight: Rgb }> = {
  desert: { night: [85, 102, 160], predawn: [135, 144, 194], dawn: [255, 190, 140], day: [255, 244, 222], dusk: [255, 160, 110], twilight: [133, 111, 170] },
  forest: { night: [78, 106, 149], predawn: [124, 152, 171], dawn: [190, 210, 165], day: [224, 239, 218], dusk: [214, 177, 139], twilight: [107, 133, 157] },
  snow: { night: [103, 131, 186], predawn: [171, 194, 224], dawn: [235, 215, 200], day: [239, 247, 255], dusk: [232, 189, 171], twilight: [131, 153, 197] },
  swamp: { night: [78, 113, 106], predawn: [123, 159, 137], dawn: [200, 196, 139], day: [223, 229, 194], dusk: [203, 171, 111], twilight: [107, 135, 103] }
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
  const night = !isDayAt(h, c) ? moonIllumination(c) : 0;
  const strength = Math.min(0.8, c.strength * (1 - night * 0.25));
  
  return [0, 1, 2].map(i => {
    const v = a.rgb[i] + (b.rgb[i] - a.rgb[i]) * t;
    const adjusted = Math.round(255 - (255 - v) * strength);
    return Math.min(255, Math.max(40, adjusted)).toString(16).padStart(2, "0");
  }).join("");
}
