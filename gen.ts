// gen.ts — generates an animated pixel-art banner for a GitHub profile README
// Install: npm i -D simple-icons
// Run:     node --experimental-strip-types gen.ts   (Node 22.6+)  or  npx tsx gen.ts
// Output:  hero-dark.svg, hero-light.svg
//
// Icon lookup order: icons/<icon>.svg (your own file) → simple-icons package → no icon.
//
// How the animation works: the whole level loops every T seconds. Every animated part (scrolling,
// jumping, ducking, shooting, falling UFOs) runs on that same T-second timeline, and the script
// computes the exact moment each obstacle reaches the robot, then writes keyframes for the action.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as simpleIcons from "simple-icons";

type StackItem = { name: string; icon?: string };

const CONFIG = {
  // Main stack → crates the robot jumps over
  // icon = simple-icons slug (see simpleicons.org) or a file name in icons/
  stack: [
    { name: "React", icon: "react" },
    { name: "Next.js", icon: "nextdotjs" },
    { name: "TypeScript", icon: "typescript" },
    { name: "Three.js", icon: "threedotjs" },
    { name: "Node.js", icon: "nodedotjs" },
    { name: "NestJS", icon: "nestjs" },
    { name: "Docker", icon: "docker" },
    { name: "Git", icon: "git" },
    { name: "Go", icon: "go" },
    { name: "PostgreSQL", icon: "postgresql" },
  ] as StackItem[],
  // Secondary stack → UFOs (ducked under or shot down)
  extras: [
    { name: "R3F", icon: "r3f" },
    { name: "Zustand", icon: "zustand" },
    { name: "MUI", icon: "mui" },
    { name: "Ant Design", icon: "antdesign" },
    { name: "Cloudflare", icon: "cloudflare" },
  ] as StackItem[],
  // Level layout, one character per obstacle:
  //   C = crate (next item from `stack`)           → jump
  //   M = mid-height UFO (next item from `extras`) → duck
  //   H = high UFO (next item from `extras`)       → shoot it down
  pattern: "CCMCCHCCMCCHCCH",
  showLabel: true, // show names above crates and UFOs
  showScore: true, // score in the top-right corner: +1 for every obstacle cleared
  scoreDigits: 4,
  crateIconSize: 20,
  ufoIconSize: 18,
  iconDir: "icons",
  width: 840,
  height: 190,
  groundY: 164,
  px: 4, // size of one "pixel"
  gap: 200, // distance between obstacles (px)
  highBefore: 260, // space from the previous obstacle to a high UFO (room to land before shooting)
  highAfter: 100, // space from a high UFO to the next obstacle
  speed: 160, // scroll speed (px/s)
  heroX: 90,
  jumpH: 84,
  jumpHalf: 0.375, // seconds to rise (and to fall)
  duckHalf: 0.45, // seconds ducked before/after a mid UFO passes
  hitAhead: 140, // how far ahead of the robot a high UFO gets hit (px)
  boltTime: 0.15, // laser travel time (s)
  fallTime: 0.55, // time for a shot UFO to hit the ground (s)
  fallDrift: 24, // forward drift while falling (px)
  fallTilt: 30, // tilt while falling (deg)
  stepTime: 0.24, // walk cycle duration (s)
};

// ---------- Sprites ----------
// One character = one pixel; characters missing from the palette are transparent.
const HERO_TOP = [
  "......a.....",
  "......#.....",
  "..########..",
  ".##########.",
  ".#vvvvvvvv#.",
  ".#vvvevvve#.",
  ".#vvvvvvvv#.",
  ".##########.",
  "...######...",
  "..########..",
  "..##aa######",
  "..########..",
  "...######...",
];
// Ducking: antenna retracted, body squashed
const DUCK_TOP = [
  "..########..",
  ".##########.",
  ".#vvvvvvvv#.",
  ".#vvvevvve#.",
  ".#vvvvvvvv#.",
  ".##########.",
  "..##aa######",
  "..########..",
];
const LEGS_A = ["...##...##..", "..##.....##."];
const LEGS_B = ["....##.##...", "....##.##..."];

// Crate without an icon: marked with an X
const CRATE_X = [
  "#########",
  "#wwwwwww#",
  "#w#www#w#",
  "#ww#w#ww#",
  "#www#www#",
  "#ww#w#ww#",
  "#w#www#w#",
  "#########",
];
// Crate with an icon: plain face so the icon sits in the middle
const CRATE_PLAIN = [
  "#########",
  "#wwwwwww#",
  "#wwwwwww#",
  "#wwwwwww#",
  "#wwwwwww#",
  "#wwwwwww#",
  "#wwwwwww#",
  "#########",
];

// UFO: the glass dome (first 4 rows) holds the icon
const UFO = [
  "....ddddddd....",
  "...ddddddddd...",
  "..ddddddddddd..",
  "..ddddddddddd..",
  "..ddddddddddd..",
  ".#############.",
  "###############",
  ".l..l..l..l..l.",
];
const DOME_ROWS = 5;

const BOOM_A = [
  "#...#...#",
  ".#..#..#.",
  "..#.o.#..",
  "###ooo###",
  "..#.o.#..",
  ".#..#..#.",
  "#...#...#",
];
const DUST = ["..#...#...#..", "#...#...#...#", ".###########."];

const BOLT = [".#.", "###", ".#."];

const CLOUD = ["...####.....", ".#########..", "############"];

// 3x5 pixel digit font
const DIGITS = [
  ["###", "#.#", "#.#", "#.#", "###"],
  [".#.", "##.", ".#.", ".#.", "###"],
  ["###", "..#", "###", "#..", "###"],
  ["###", "..#", "###", "..#", "###"],
  ["#.#", "#.#", "###", "..#", "..#"],
  ["###", "#..", "###", "..#", "###"],
  ["###", "#..", "###", "#.#", "###"],
  ["###", "..#", "..#", "..#", "..#"],
  ["###", "#.#", "###", "#.#", "###"],
  ["###", "#.#", "###", "..#", "###"],
];

// ---------- Themes ----------
type Theme = Record<
  | "body"
  | "visor"
  | "eye"
  | "accent"
  | "crate"
  | "wood"
  | "icon"
  | "hull"
  | "dome"
  | "lights"
  | "ufoIcon"
  | "boom"
  | "core"
  | "dust"
  | "ground"
  | "label"
  | "cloud"
  | "hill"
  | "hud",
  string
>;

const THEMES: Record<"dark" | "light", Theme> = {
  dark: {
    body: "#e6edf3",
    visor: "#1b2230",
    eye: "#4ce0b3",
    accent: "#ff8f70",
    crate: "#a87a42",
    wood: "#4b3520",
    icon: "#f3e9da",
    hull: "#9a7ae0",
    dome: "#b6e3ff",
    lights: "#ffd166",
    ufoIcon: "#1b2230",
    boom: "#ffb454",
    core: "#fff3c4",
    dust: "#8b949e",
    ground: "#6e7681",
    label: "#9da7b3",
    cloud: "#262c36",
    hill: "#161c25",
    hud: "#9da7b3",
  },
  light: {
    body: "#2d333b",
    visor: "#eef2f6",
    eye: "#0f9b74",
    accent: "#e5534b",
    crate: "#6b4718",
    wood: "#d9a656",
    icon: "#4a3010",
    hull: "#6e40c9",
    dome: "#c8e6ff",
    lights: "#d4a72c",
    ufoIcon: "#0a3069",
    boom: "#e5534b",
    core: "#f2cc60",
    dust: "#8c959f",
    ground: "#8c959f",
    label: "#59636e",
    cloud: "#e4e8ec",
    hill: "#eef1f4",
    hud: "#59636e",
  },
};

// ---------- Helpers ----------
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r = (n: number) => +n.toFixed(3);

// Merge consecutive same-colored pixels in a row into one rect to keep the file small
function sprite(
  rows: string[],
  pal: Record<string, string>,
  x = 0,
  y = 0,
  s = CONFIG.px,
) {
  let out = "";
  rows.forEach((row, ry) => {
    let rx = 0;
    while (rx < row.length) {
      const c = row[rx];
      if (!pal[c]) {
        rx++;
        continue;
      }
      let len = 1;
      while (row[rx + len] === c) len++;
      out += `<rect x="${r(x + rx * s)}" y="${r(y + ry * s)}" width="${len * s}" height="${s}" fill="${pal[c]}"/>`;
      rx += len;
    }
  });
  return out;
}

// ---------- Icons ----------
// keepColor = true for your own files (original colors kept), false for simple-icons (tinted by theme).
type Icon = { id: string; symbol: string; keepColor: boolean };

function loadIcon(slug: string | undefined, id: string): Icon | null {
  if (!slug) return null;

  const file = `${CONFIG.iconDir}/${slug}.svg`;
  if (existsSync(file)) {
    const raw = readFileSync(file, "utf8")
      .replace(/<\?xml[^>]*\?>/, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    const open = raw.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    const inner = raw
      .replace(/^[\s\S]*?<svg\b[^>]*>/i, "")
      .replace(/<\/svg>\s*$/i, "");
    let viewBox = open.match(/viewBox="([^"]+)"/i)?.[1];
    if (!viewBox) {
      const w = parseFloat(open.match(/\bwidth="([\d.]+)/i)?.[1] ?? "24");
      const h = parseFloat(open.match(/\bheight="([\d.]+)/i)?.[1] ?? "24");
      viewBox = `0 0 ${w} ${h}`;
    }
    return {
      id,
      symbol: `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`,
      keepColor: true,
    };
  }

  const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
  const si = (simpleIcons as Record<string, { path: string } | undefined>)[key];
  if (si?.path) {
    return {
      id,
      symbol: `<symbol id="${id}" viewBox="0 0 24 24"><path d="${si.path}"/></symbol>`,
      keepColor: false,
    };
  }

  console.warn(`! Icon "${slug}" not found — drawing without an icon`);
  return null;
}

function useIcon(ic: Icon, x: number, y: number, size: number, tint: string) {
  const fill = ic.keepColor ? "" : ` fill="${tint}"`;
  return `<use href="#${ic.id}" x="${r(x)}" y="${r(y)}" width="${size}" height="${size}"${fill} class="icon"/>`;
}

// ---------- Distant hills ----------
// Sum of a few sine waves whose periods divide W, so the strip tiles seamlessly; quantized to pixels.
function hills(W: number, groundY: number, color: string, s: number) {
  const col = s * 2;
  const cols: { x: number; h: number }[] = [];
  for (let x = 0; x < W; x += col) {
    const u = (x / W) * Math.PI * 2;
    const h =
      34 +
      16 * Math.sin(2 * u + 0.6) +
      9 * Math.sin(5 * u + 1.9) +
      4 * Math.sin(11 * u);
    cols.push({ x, h: Math.round(h / s) * s });
  }
  // merge adjacent columns of equal height
  let out = "";
  for (let i = 0; i < cols.length; ) {
    let j = i + 1;
    while (j < cols.length && cols[j].h === cols[i].h) j++;
    out += `<rect x="${cols[i].x}" y="${groundY - cols[i].h}" width="${(j - i) * col}" height="${cols[i].h}" fill="${color}"/>`;
    i = j;
  }
  return out;
}

// ---------- Level geometry & timeline ----------
type Kind = "C" | "M" | "H";
type Obstacle = { kind: Kind; t: number; cx: number; item: number };

const px = CONFIG.px;
const heroW = HERO_TOP[0].length * px;
const heroCx = CONFIG.heroX + heroW / 2;
const standH = (HERO_TOP.length + LEGS_A.length) * px;
const duckH = (DUCK_TOP.length + LEGS_A.length) * px;
const crateW = CRATE_X[0].length * px;
const crateH = CRATE_X.length * px;
const ufoW = UFO[0].length * px;
const ufoH = UFO.length * px;
const midUfoY = CONFIG.groundY - duckH - 4 - ufoH; // clears a ducking robot by 4px, hits a standing one
const highUfoY = CONFIG.groundY - 120;
const dropY = CONFIG.groundY - (highUfoY + ufoH); // fall distance of a shot UFO

const kinds = [...CONFIG.pattern.replace(/\s/g, "")] as Kind[];
if (kinds.some((k) => !"CMH".includes(k)))
  throw new Error(`pattern may only contain C, M, H`);
const N = kinds.length;
// Space before each obstacle (the first one's space is measured from the last obstacle of the loop)
const spacing = kinds.map((k, i) =>
  k === "H"
    ? CONFIG.highBefore
    : kinds[(i - 1 + kinds.length) % kinds.length] === "H"
      ? CONFIG.highAfter
      : CONFIG.gap,
);
const L = spacing.reduce((a, b) => a + b, 0); // strip length
const T = L / CONFIG.speed; // loop duration

const crateCount = kinds.filter((k) => k === "C").length;
const ufoCount = N - crateCount;
if (crateCount !== CONFIG.stack.length)
  console.warn(
    `! pattern has ${crateCount} crates but stack has ${CONFIG.stack.length} items — stack will cycle`,
  );
if (ufoCount !== CONFIG.extras.length)
  console.warn(
    `! pattern has ${ufoCount} UFOs but extras has ${CONFIG.extras.length} items — extras will cycle`,
  );

// Each obstacle has an event time: for C and M it is when the obstacle is centered on the robot,
// for H it is when the laser hits it (the UFO is then `hitAhead` px in front of the robot).
const actionX = (k: Kind) => heroCx + (k === "H" ? CONFIG.hitAhead : 0);

// Time span each event needs around its event time.
// `busy` = the robot is occupied; `full` also covers the UFO falling and the dust cloud.
const span = (k: Kind) => {
  const { jumpHalf, duckHalf, boltTime, fallTime } = CONFIG;
  if (k === "C")
    return { busy: [-jumpHalf, jumpHalf], full: [-jumpHalf, jumpHalf] };
  if (k === "M")
    return { busy: [-duckHalf, duckHalf], full: [-duckHalf, duckHalf] };
  return {
    busy: [-boltTime - 0.05, 0.1],
    full: [-boltTime - 0.05, fallTime + 0.25],
  };
};

// Lay obstacles out along the strip, then place the loop seam in the middle of the quiet time
// between the last event and the first one, so no animation ever crosses the seam.
let pos = 0;
const raw = kinds.map((k, i) => {
  if (i > 0) pos += spacing[i];
  return (pos - (actionX(k) - heroCx)) / CONFIG.speed; // event time before shifting
});
const lastEnd = raw[N - 1] + span(kinds[N - 1]).full[1];
const firstStart = raw[0] + span(kinds[0]).full[0] + T;
if (firstStart <= lastEnd)
  console.warn(
    "! not enough room at the loop seam — increase the spacing before the first obstacle",
  );
const shiftT = T - (lastEnd + firstStart) / 2;

let nextCrate = 0,
  nextUfo = 0;
const level: Obstacle[] = kinds.map((kind, i) => {
  const t = raw[i] + shiftT;
  const cx = actionX(kind) + CONFIG.speed * t;
  const item =
    kind === "C"
      ? nextCrate++ % CONFIG.stack.length
      : nextUfo++ % CONFIG.extras.length;
  return { kind, t, cx, item };
});

// Two robot actions must not overlap (e.g. shooting while still in the air)
for (let i = 0; i < N; i++) {
  const a = level[i],
    b = level[(i + 1) % N];
  const aEnd = a.t + span(a.kind).busy[1];
  const bStart = b.t + span(b.kind).busy[0] + (i === N - 1 ? T : 0);
  if (aEnd > bStart)
    console.warn(
      `! actions overlap: ${a.kind}#${i} and ${b.kind}#${(i + 1) % N} — add spacing`,
    );
}

const pct = (t: number) => r((t / T) * 100);

// Hold-style keyframes (use with steps(1, end)): `on` inside the intervals, `off` elsewhere
function toggleKf(
  name: string,
  intervals: [number, number][],
  on: number,
  off: number,
) {
  let s = `@keyframes ${name} { 0% { opacity: ${off}; } `;
  for (const [a, b] of intervals)
    s += `${pct(a)}% { opacity: ${on}; } ${pct(b)}% { opacity: ${off}; } `;
  return s + `100% { opacity: ${off}; } }`;
}

// Jump curve used by the self-check (close to the cubic-bezier ease-out/ease-in pair in the CSS)
function jumpOffset(t: number) {
  for (const o of level) {
    if (o.kind !== "C") continue;
    const d = (t - o.t) / CONFIG.jumpHalf;
    if (Math.abs(d) < 1) return CONFIG.jumpH * (1 - d * d);
  }
  return 0;
}

// Sweep the loop and report any frame where the robot overlaps a live obstacle (falling UFOs included)
function selfCheck() {
  const { heroX, groundY, speed, duckHalf, fallTime, fallDrift } = CONFIG;
  const hits = new Set<string>();
  for (let t = 0; t < T; t += 0.005) {
    const ducking = level.some(
      (o) => o.kind === "M" && Math.abs(t - o.t) < duckHalf,
    );
    const lift = jumpOffset(t);
    const hx0 = heroX + px,
      hx1 = heroX + heroW - px;
    const hy1 = groundY - lift;
    const hy0 = ducking ? groundY - duckH : hy1 - standH + 2 * px; // ignore the thin antenna
    level.forEach((o, i) => {
      for (const shift of [-L, 0, L]) {
        let x = o.cx + shift - speed * t;
        let box: [number, number, number, number];
        if (o.kind === "C")
          box = [x - crateW / 2, x + crateW / 2, groundY - crateH, groundY];
        else if (o.kind === "M")
          box = [x - ufoW / 2, x + ufoW / 2, midUfoY, midUfoY + ufoH];
        else {
          if (shift < 0) continue; // shot down in the previous loop
          let y = highUfoY;
          if (shift === 0 && t >= o.t) {
            const k = (t - o.t) / fallTime;
            if (k > 1) continue; // already crashed
            y += dropY * k * k;
            x += fallDrift * k;
          }
          box = [x - ufoW / 2, x + ufoW / 2, y, y + ufoH];
        }
        if (hx0 < box[1] && hx1 > box[0] && hy0 < box[3] && hy1 > box[2])
          hits.add(`${o.kind}#${i}`);
      }
    });
  }
  if (hits.size) console.warn(`! Collisions with: ${[...hits].join(", ")}`);
  else console.log("✓ self-check: no collisions");
}

// ---------- Build ----------
const crateIcons = CONFIG.stack.map((item, i) => loadIcon(item.icon, `ic${i}`));
const ufoIcons = CONFIG.extras.map((item, i) => loadIcon(item.icon, `ix${i}`));

function build(t: Theme) {
  const {
    width: W,
    height: H,
    groundY,
    speed,
    heroX,
    jumpH,
    jumpHalf,
    duckHalf,
    boltTime,
    fallTime,
    fallDrift,
    fallTilt,
    stepTime,
    crateIconSize,
    ufoIconSize,
    showLabel,
    showScore,
  } = CONFIG;

  const heroY = groundY - standH;
  const duckY = groundY - duckH;
  const defs = [...crateIcons, ...ufoIcons]
    .map((ic) => ic?.symbol ?? "")
    .join("");
  const cratePal = { "#": t.crate, w: t.wood };
  const ufoPal = { "#": t.hull, d: t.dome, l: t.lights };
  const boomPal = { "#": t.boom, o: t.core };

  // Laser starts at the front eye
  const eyeX = heroX + 9 * px,
    eyeY = heroY + 5 * px;
  const boltX = eyeX + px / 2 - 4.5,
    boltY = eyeY + px / 2 - 4.5;

  // UFO with its icon in the dome and its name above
  const ufoSprite = (cx: number, y: number, item: number) => {
    const ic = ufoIcons[item];
    let s = sprite(UFO, ufoPal, cx - ufoW / 2, y);
    if (ic)
      s += useIcon(
        ic,
        cx - ufoIconSize / 2,
        y + (DOME_ROWS * px - ufoIconSize) / 2 + 1,
        ufoIconSize,
        t.ufoIcon,
      );
    if (showLabel)
      s += `<text x="${r(cx)}" y="${r(y - 4)}" class="label">${esc(CONFIG.extras[item].name)}</text>`;
    return `<g class="bob">${s}</g>`;
  };

  let css = "";
  let strip = "";

  // ---- Obstacles: three copies (-1, 0, +1 loop) so the strip is seamless on both sides ----
  for (const shift of [-1, 0, 1]) {
    level.forEach((o, i) => {
      const cx = o.cx + shift * L;

      if (o.kind === "C") {
        const x = cx - crateW / 2,
          y = groundY - crateH;
        const ic = crateIcons[o.item];
        strip += sprite(ic ? CRATE_PLAIN : CRATE_X, cratePal, x, y);
        if (ic)
          strip += useIcon(
            ic,
            x + (crateW - crateIconSize) / 2,
            y + (crateH - crateIconSize) / 2,
            crateIconSize,
            t.icon,
          );
        if (showLabel)
          strip += `<text x="${r(cx)}" y="${y - 8}" class="label">${esc(CONFIG.stack[o.item].name)}</text>`;
      }

      if (o.kind === "M") strip += ufoSprite(cx, midUfoY, o.item);

      if (o.kind === "H") {
        // copy -1 was shot in the previous loop, copy +1 will be shot in the next one
        if (shift === 1) strip += ufoSprite(cx, highUfoY, o.item);
        if (shift === 0) {
          const cy = highUfoY + ufoH / 2;
          const landX = cx + fallDrift;
          strip += `<g class="fall u${i}">${ufoSprite(cx, highUfoY, o.item)}</g>`;
          strip += `<g class="boom ba${i}">${sprite(BOOM_A, boomPal, cx - 18, cy - 14)}</g>`;
          strip += `<g class="boom bd${i}">${sprite(DUST, { "#": t.dust }, landX - 26, groundY - 12)}</g>`;

          const hit = o.t,
            land = o.t + fallTime;
          const fallen = `translate(${fallDrift}px, ${dropY}px) rotate(${fallTilt}deg)`;
          css += `.u${i} { animation: u${i} ${r(T)}s linear infinite; }\n`;
          css += `@keyframes u${i} { 0% { transform: none; opacity: 1; } `;
          css += `${pct(hit)}% { transform: none; opacity: 1; animation-timing-function: cubic-bezier(.55,0,1,.45); } `;
          css += `${pct(land)}% { transform: ${fallen}; opacity: 1; } `;
          css += `${r(pct(land) + 0.01)}% { transform: ${fallen}; opacity: 0; } `;
          css += `100% { transform: ${fallen}; opacity: 0; } }\n`;
          css += `.ba${i} { animation: ba${i} ${r(T)}s steps(1, end) infinite; }\n${toggleKf(`ba${i}`, [[hit, hit + 0.12]], 1, 0)}\n`;
          css += `.bd${i} { animation: bd${i} ${r(T)}s steps(1, end) infinite; }\n${toggleKf(`bd${i}`, [[land, land + 0.25]], 1, 0)}\n`;
        }
      }

      // pebbles on the ground
      const x = cx - spacing[i] / 2;
      strip += `<rect x="${r(x + 70)}" y="${groundY + 8}" width="${px * 2}" height="${px}" fill="${t.ground}"/>`;
      strip += `<rect x="${r(x + 135)}" y="${groundY + 14}" width="${px}" height="${px}" fill="${t.ground}"/>`;
    });
  }

  // ---- Robot timeline ----
  const jumps = level.filter((o) => o.kind === "C");
  const ducks = level
    .filter((o) => o.kind === "M")
    .map((o) => [o.t - duckHalf, o.t + duckHalf] as [number, number]);
  const shots = level.filter((o) => o.kind === "H");

  let jumpKf = `@keyframes jump { 0% { transform: translateY(0); } `;
  for (const o of jumps) {
    jumpKf += `${pct(o.t - jumpHalf)}% { transform: translateY(0); animation-timing-function: cubic-bezier(.33,.66,.66,1); } `;
    jumpKf += `${pct(o.t)}% { transform: translateY(-${jumpH}px); animation-timing-function: cubic-bezier(.33,0,.66,.33); } `;
    jumpKf += `${pct(o.t + jumpHalf)}% { transform: translateY(0); } `;
  }
  jumpKf += `100% { transform: translateY(0); } }`;

  // Laser bolt: outer group shows it during flight, inner group moves it from the eye to the UFO
  const hitX = heroCx + CONFIG.hitAhead;
  const dx = r(hitX - (boltX + 4.5)),
    dy = r(highUfoY + ufoH / 2 - (boltY + 4.5));
  let boltKf = `@keyframes boltMove { 0% { transform: translate(0, 0); } `;
  for (const o of shots) {
    boltKf += `${pct(o.t - boltTime)}% { transform: translate(0, 0); } ${pct(o.t)}% { transform: translate(${dx}px, ${dy}px); } `;
  }
  boltKf += `100% { transform: translate(${dx}px, ${dy}px); } }`;
  const flights = shots.map((o) => [o.t - boltTime, o.t] as [number, number]);
  const flashes = shots.map(
    (o) => [o.t - boltTime - 0.05, o.t - boltTime + 0.1] as [number, number],
  );

  css += `.hero { animation: jump ${r(T)}s linear infinite; }\n${jumpKf}\n`;
  css += `.stand { animation: stand ${r(T)}s steps(1, end) infinite; }\n${toggleKf("stand", ducks, 0, 1)}\n`;
  css += `.duck { opacity: 0; animation: duck ${r(T)}s steps(1, end) infinite; }\n${toggleKf("duck", ducks, 1, 0)}\n`;
  css += `.flash { opacity: 0; animation: flash ${r(T)}s steps(1, end) infinite; }\n${toggleKf("flash", flashes, 1, 0)}\n`;
  css += `.boltShow { opacity: 0; animation: boltShow ${r(T)}s steps(1, end) infinite; }\n${toggleKf("boltShow", flights, 1, 0)}\n`;
  css += `.boltMove { animation: boltMove ${r(T)}s linear infinite; }\n${boltKf}\n`;

  // ---- Parallax: clouds and hills scroll slower ----
  const clouds = [
    [150, 26],
    [470, 14],
    [700, 34],
  ];
  let cloudStrip = "";
  let hillStrip = "";
  for (const off of [0, W]) {
    for (const [cx, cy] of clouds)
      cloudStrip += sprite(CLOUD, { "#": t.cloud }, cx + off, cy, 3);
    hillStrip += `<g transform="translate(${off} 0)">${hills(W, groundY, t.hill, px)}</g>`;
  }

  // ---- Score: +1 when each obstacle is cleared ----
  // Each digit is a vertical 0..9 column, clipped to one cell and moved with hold-style keyframes.
  // The score keeps growing across loops, so a digit's pattern only repeats after
  // lcm(E, 10^(place+1)) points (E = obstacles per loop); that is the length of its animation.
  let hud = "";
  if (showScore) {
    const ds = 3,
      dW = 3 * ds,
      dH = 5 * ds,
      step = dH + ds * 2,
      digits = CONFIG.scoreDigits,
      top = 12;
    const numX = W - 20 - digits * (dW + ds) + ds;

    // Moment each obstacle counts as cleared: after landing, after the UFO has passed, or on the hit
    const ticks = level.map(
      (o) => o.t + (o.kind === "C" ? jumpHalf : o.kind === "M" ? duckHalf : 0),
    );
    const E = ticks.length;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

    let column = "";
    for (let n = 0; n < 10; n++)
      column += sprite(DIGITS[n], { "#": t.hud }, 0, n * step, ds);

    for (let d = 0; d < digits; d++) {
      const x = numX + d * (dW + ds);
      const unit = 10 ** (digits - 1 - d); // 1 = ones digit
      const points = (E * unit * 10) / gcd(E, unit * 10); // lcm(E, 10 * unit)
      const dur = (points / E) * T;
      const p = (time: number) => +((time / dur) * 100).toFixed(5);

      let kf = `@keyframes sc${d} { 0% { transform: translateY(0); } `;
      let prev = 0;
      for (let n = 1; n <= points; n++) {
        const value = Math.floor(n / unit) % 10;
        if (value === prev) continue;
        const time = Math.floor((n - 1) / E) * T + ticks[(n - 1) % E];
        kf += `${p(time)}% { transform: translateY(-${value * step}px); } `;
        prev = value;
      }
      kf += `100% { transform: translateY(0); } }`;

      hud += `<clipPath id="dg${d}"><rect x="${x}" y="${top}" width="${dW}" height="${dH}"/></clipPath>`;
      hud += `<g clip-path="url(#dg${d})"><g transform="translate(${x} ${top})"><g class="d${d}">${column}</g></g></g>`;
      css += `.d${d} { animation: sc${d} ${r(dur)}s steps(1, end) infinite; }\n${kf}\n`;
    }
  }

  const heroPal = { "#": t.body, v: t.visor, e: t.eye, a: t.accent };
  const legs = (y: number) =>
    `<g class="legA">${sprite(LEGS_A, heroPal, heroX, y)}</g><g class="legB">${sprite(LEGS_B, heroPal, heroX, y)}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
<defs>${defs}</defs>
<style>
  .label { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; text-anchor: middle;
           font-size: 12px; font-weight: 600; fill: ${t.label}; }
  .icon { shape-rendering: geometricPrecision; }
  .boom { opacity: 0; }
  .fall { transform-box: fill-box; transform-origin: center; }

  .strip { animation: scroll ${r(T)}s linear infinite; }
  @keyframes scroll { to { transform: translateX(-${L}px); } }

  .hills { animation: pan ${r(W / (speed / 4))}s linear infinite; }
  .clouds { animation: pan ${r(W / (speed / 8))}s linear infinite; }
  @keyframes pan { to { transform: translateX(-${W}px); } }

  .bob { animation: bob 0.6s steps(1, end) infinite; }
  @keyframes bob { 0% { transform: translateY(0); } 50% { transform: translateY(-${px}px); } }

  .legA, .legB { animation: step ${stepTime}s steps(1, end) infinite; }
  .legB { opacity: 0; animation-delay: -${stepTime / 2}s; }
  @keyframes step { 0% { opacity: 1; } 50% { opacity: 0; } }

${css}
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; }
  }
</style>
<g class="clouds">${cloudStrip}</g>
<g class="hills">${hillStrip}</g>
<rect x="0" y="${groundY}" width="${W}" height="2" fill="${t.ground}"/>
<g class="strip">${strip}</g>
<g class="hero">
  <g class="stand">${sprite(HERO_TOP, heroPal, heroX, heroY)}${legs(heroY + HERO_TOP.length * px)}</g>
  <g class="duck">${sprite(DUCK_TOP, heroPal, heroX, duckY)}${legs(duckY + DUCK_TOP.length * px)}</g>
  <g class="flash"><rect x="${eyeX - px}" y="${eyeY - px}" width="${px * 3}" height="${px * 3}" fill="${t.eye}" opacity=".45"/><rect x="${eyeX}" y="${eyeY}" width="${px}" height="${px}" fill="${t.core}"/></g>
</g>
<g class="boltShow"><g class="boltMove">${sprite(BOLT, { "#": t.eye }, boltX, boltY, 3)}</g></g>
${hud}
</svg>
`;
}

selfCheck();
for (const name of ["dark", "light"] as const) {
  writeFileSync(`hero-${name}.svg`, build(THEMES[name]));
  console.log(`✓ hero-${name}.svg`);
}
