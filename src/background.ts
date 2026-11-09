import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { CLOCK_KEY, hourOfDay, readClock, tintHex } from "./clock";
import type { ClockState } from "./clock";

// Script de fundo: cada navegador desenha o próprio filtro (item local), a partir do relógio da cena.
const EXTENSION_ID = "com.example.dynamic-day-cycle";
const TAG = `${EXTENSION_ID}/tint`;

let clock: ClockState | null = null;
let tintId: string | null = null;
let lastHex = "";
let lastGeo = "";
let unsubscribers: Array<() => void> = [];
let timer: number | undefined;
let running = false;
let again = false;

const SKSL = `
  uniform vec3 tint;
  half4 main(float2 coord) {
    return half4(tint, 1.0);
  }
`;

function rgbUniform(hex: string) {
  return {
    name: "tint",
    value: {
      x: parseInt(hex.slice(0, 2), 16) / 255,
      y: parseInt(hex.slice(2, 4), 16) / 255,
      z: parseInt(hex.slice(4, 6), 16) / 255
    }
  };
}

// Retângulo que cobre o mapa (com folga). Sem mapa, usa uma área grande em volta da origem.
async function coverage() {
  const PAD = 1500;
  try {
    let items = await OBR.scene.items.getItems((i: Item) => i.layer === "MAP");
    if (!items.length) items = await OBR.scene.items.getItems();
    if (items.length) {
      const b = await OBR.scene.items.getItemBounds(items.map((i) => i.id));
      return { x: b.min.x - PAD, y: b.min.y - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
    }
  } catch { /* usa o padrão */ }
  return { x: -10000, y: -10000, width: 20000, height: 20000 };
}

async function removeTint() {
  const locals = await OBR.scene.local.getItems((i: Item) => typeof i.metadata[TAG] !== "undefined");
  if (locals.length) await OBR.scene.local.deleteItems(locals.map((i) => i.id));
  tintId = null;
  lastHex = "";
  lastGeo = "";
}

async function apply() {
  if (!clock || !clock.enabled || !clock.tint) {
    if (tintId || lastHex) await removeTint();
    return;
  }
  const hex = tintHex(hourOfDay(clock), clock);
  // Branco puro não muda nada: tira o efeito para não gastar GPU de dia.
  if (hex === "ffffff") {
    if (tintId) await removeTint();
    return;
  }

  const geo = await coverage();
  const geoSig = JSON.stringify([geo, clock.tintLayer]);

  // Se o efeito sumiu (troca de cena, limpeza), recria.
  if (tintId) {
    const found = await OBR.scene.local.getItems([tintId]);
    if (!found.length) { tintId = null; lastHex = ""; lastGeo = ""; }
  }

  if (!tintId || geoSig !== lastGeo) {
    if (tintId) await removeTint();
    const effect = buildEffect()
      .effectType("STANDALONE")
      .width(geo.width)
      .height(geo.height)
      .position({ x: geo.x, y: geo.y })
      .layer(clock.tintLayer)
      .blendMode("MULTIPLY")
      .locked(true)
      .disableHit(true)
      .zIndex(0) // abaixo das auras (que usam o zIndex padrão, bem maior): a luz fica por cima da escuridão
      .uniforms([rgbUniform(hex)])
      .sksl(SKSL)
      .metadata({ [TAG]: true })
      .build();
    await OBR.scene.local.addItems([effect]);
    tintId = effect.id;
    lastHex = hex;
    lastGeo = geoSig;
    return;
  }

  if (hex !== lastHex) {
    await OBR.scene.local.updateItems([tintId], (drafts) => {
      for (const draft of drafts) (draft as any).uniforms = [rgbUniform(hex)];
    });
    lastHex = hex;
  }
}

function queueApply() {
  if (running) { again = true; return; }
  running = true;
  (async () => {
    try {
      do {
        again = false;
        try { await apply(); } catch (error) { console.error("Dynamic Day Cycle: falha ao aplicar o filtro", error); }
      } while (again);
    } finally {
      running = false;
    }
  })();
}

function start() {
  stop();
  unsubscribers = [
    OBR.scene.onMetadataChange((meta) => { clock = readClock(meta); queueApply(); }),
    OBR.scene.items.onChange(() => queueApply()) // mapa novo ou movido: recalcula a cobertura
  ];
  OBR.scene.getMetadata().then((meta) => { clock = readClock(meta); queueApply(); }).catch(() => queueApply());
  // A hora é calculada localmente; só reavalia a cor uma vez por segundo.
  timer = window.setInterval(() => queueApply(), 1000);
}

function stop() {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
  clock = null;
  tintId = null;
  lastHex = "";
  lastGeo = "";
}

OBR.onReady(async () => {
  OBR.scene.onReadyChange((ready) => (ready ? start() : stop()));
  if (await OBR.scene.isReady()) start();
});

export { CLOCK_KEY };
