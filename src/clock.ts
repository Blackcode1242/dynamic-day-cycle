// Contrato entre o Dynamic Day Cycle e o Dynamic Auras & Lights.
// ESTE ARQUIVO É IDÊNTICO NAS DUAS EXTENSÕES (cópia em src/clock.ts de cada projeto) e não importa o SDK.
// O relógio fica nos metadados da cena. Cada navegador calcula a hora sozinho a partir das âncoras,
// então não existe "tick" sendo enviado: só muda algo quando o GM mexe nos controles.

export const CLOCK_KEY = "com.example.dynamic-day-cycle/state";

export type TintLayer = "DRAWING" | "ATTACHMENT";
export type Schedule = "always" | "night" | "day";

export type ClockState = {
  enabled: boolean;      // ciclo ligado nesta cena
  running: boolean;      // relógio andando (false = pausado)
  speed: number;         // 1 = tempo real; 64 = 1 min real vale 64 min de jogo
  anchorReal: number;    // Date.now() (ms) no momento da âncora
  anchorGame: number;    // segundos de jogo (desde 00:00 do dia 0) no momento da âncora
  sunrise: number;       // hora do nascer do sol (0-24)
  sunset: number;        // hora do pôr do sol (0-24)
  tint: boolean;         // aplica o filtro de cor no mapa
  strength: number;      // 0.2 a 1: força do filtro (1 = noite bem escura)
  tintLayer: TintLayer;  // DRAWING = só o mapa; ATTACHMENT = mapa e tokens
  stagger: number;       // minutos de variação aleatória no horário em que cada luz acende/apaga
};

export const DEFAULT_CLOCK: ClockState = {
  enabled: false,
  running: false,
  speed: 60,
  anchorReal: 0,
  anchorGame: 12 * 3600,
  sunrise: 6,
  sunset: 18,
  tint: true,
  strength: 0.85,
  tintLayer: "DRAWING",
  stagger: 20
};

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4, 8, 16, 32, 60, 64, 120, 240, 720];

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeClock(raw: unknown): ClockState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CLOCK;
  return {
    enabled: r.enabled === true,
    running: r.running === true,
    speed: num(r.speed, d.speed, 0.01, 5000),
    anchorReal: num(r.anchorReal, d.anchorReal, 0, 8.64e15),
    anchorGame: num(r.anchorGame, d.anchorGame, -1e12, 1e12),
    sunrise: num(r.sunrise, d.sunrise, 3, 10),
    sunset: num(r.sunset, d.sunset, 15, 22),
    tint: r.tint !== false,
    strength: num(r.strength, d.strength, 0.2, 1),
    tintLayer: r.tintLayer === "ATTACHMENT" ? "ATTACHMENT" : "DRAWING",
    stagger: num(r.stagger, d.stagger, 0, 90)
  };
}

// Lê o relógio dos metadados da cena. null = extensão do relógio nunca foi usada nesta cena.
export function readClock(meta: Record<string, unknown> | undefined | null): ClockState | null {
  const raw = meta?.[CLOCK_KEY];
  return raw && typeof raw === "object" ? normalizeClock(raw) : null;
}

export function gameSeconds(c: ClockState, now = Date.now()) {
  return c.running ? c.anchorGame + ((now - c.anchorReal) / 1000) * c.speed : c.anchorGame;
}

// Hora do dia de jogo, de 0 (inclusive) a 24 (exclusive).
export function hourOfDay(c: ClockState, now = Date.now()) {
  const h = (gameSeconds(c, now) / 3600) % 24;
  return h < 0 ? h + 24 : h;
}

export function formatHour(h: number) {
  const total = Math.floor(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function parseHour(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h + min / 60 : null;
}

export function isDayAt(h: number, c: ClockState) {
  return h >= c.sunrise && h < c.sunset;
}

export type Phase = "dawn" | "day" | "dusk" | "night";
export const PHASE_LABELS: Record<Phase, string> = { dawn: "Amanhecer", day: "Dia", dusk: "Entardecer", night: "Noite" };

export function phaseAt(h: number, c: ClockState): Phase {
  if (h >= c.sunrise - 1 && h < c.sunrise + 1) return "dawn";
  if (h >= c.sunrise + 1 && h < c.sunset - 1) return "day";
  if (h >= c.sunset - 1 && h < c.sunset + 1) return "dusk";
  return "night";
}

// ---- Luzes: cada uma acende/apaga num horário levemente diferente (some a sensação de "interruptor geral") ----
function hashId(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return h;
}

// Desvio estável por item, entre -stagger e +stagger minutos (em horas).
export function staggerHours(id: string, staggerMinutes: number) {
  const u = ((hashId(id) >>> 0) % 2001) / 1000 - 1; // -1 a 1
  return (u * staggerMinutes) / 60;
}

// Esta luz deve estar acesa agora? Sem relógio ativo, tudo fica como antes (sempre aceso).
export function lightIsOn(id: string, schedule: Schedule, c: ClockState | null, now = Date.now()) {
  if (!c || !c.enabled || schedule === "always") return true;
  let h = hourOfDay(c, now) - staggerHours(id, c.stagger);
  h = ((h % 24) + 24) % 24;
  const day = isDayAt(h, c);
  return schedule === "night" ? !day : day;
}

// ---- Filtro de cor (multiplica as cores do mapa: branco = sem efeito) ----
type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const NIGHT: Rgb = [52, 68, 140];
const PREDAWN: Rgb = [110, 115, 175];
const DAWN: Rgb = [255, 170, 125];
const DUSK: Rgb = [255, 150, 105];
const TWILIGHT: Rgb = [120, 100, 165];

function keyframes(c: ClockState): { h: number; rgb: Rgb }[] {
  const wrap = (h: number) => ((h % 24) + 24) % 24;
  const list = [
    { h: c.sunrise - 1.5, rgb: NIGHT },
    { h: c.sunrise - 0.5, rgb: PREDAWN },
    { h: c.sunrise, rgb: DAWN },
    { h: c.sunrise + 1.5, rgb: WHITE },
    { h: c.sunset - 1.5, rgb: WHITE },
    { h: c.sunset, rgb: DUSK },
    { h: c.sunset + 0.75, rgb: TWILIGHT },
    { h: c.sunset + 1.75, rgb: NIGHT }
  ].map((k) => ({ h: wrap(k.h), rgb: k.rgb }));
  return list.sort((a, b) => a.h - b.h);
}

export function tintHex(h: number, c: ClockState): string {
  const keys = keyframes(c);
  // Procura o trecho [a, b] que contém h, dando a volta na meia-noite.
  let a = keys[keys.length - 1];
  let b = keys[0];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].h > h) { b = keys[i]; a = keys[(i + keys.length - 1) % keys.length]; break; }
    if (i === keys.length - 1) { a = keys[i]; b = keys[0]; }
  }
  const span = ((b.h - a.h) + 24) % 24 || 24;
  const t = Math.min(1, Math.max(0, (((h - a.h) + 24) % 24) / span));
  const s = c.strength;
  const hex = [0, 1, 2].map((i) => {
    const v = a.rgb[i] + (b.rgb[i] - a.rgb[i]) * t;
    const out = Math.round(255 + (v - 255) * s);
    return Math.min(255, Math.max(0, out)).toString(16).padStart(2, "0");
  });
  return hex.join("");
}
