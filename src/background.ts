import OBR, { buildEffect } from "@owlbear-rodeo/sdk";
import type { Item } from "@owlbear-rodeo/sdk";
import { hourOfDay, readClock, tintHex } from "./clock";
import type { ClockState } from "./clock";

const EXTENSION_ID = "com.example.dynamic-day-cycle";
const TAG = `${EXTENSION_ID}/tint`;

let clock: ClockState | null = null;
let tintId: string | null = null;
let lastHex = "", lastGeo = "";
let unsubscribers: Array<() => void> = [];
let timer: number | undefined;
let running = false, again = false;

const TINT_SKSL = `uniform vec3 tint; half4 main(float2 coord) { return half4(tint, 1.0); }`;

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
  clock = null; tintId = null; lastHex = ""; lastGeo = "";
}

OBR.onReady(async () => {
  OBR.scene.onReadyChange(ready => ready ? start() : stop());
  if (await OBR.scene.isReady()) start();
});