// gen.ts — generates an animated pixel-art banner for a GitHub profile README
// Install: npm i -D simple-icons
// Run:     node --experimental-strip-types gen.ts   (Node 22.6+)  or  npx tsx gen.ts
// Output:  hero-dark.svg, hero-light.svg
//
// Icon lookup order: icons/<icon>.svg (your own file) → simple-icons package → fallback crate with an X.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as simpleIcons from "simple-icons";

type StackItem = { name: string; icon?: string };

const CONFIG = {
  // icon = simple-icons slug (see simpleicons.org) or a file name in icons/
  stack: [
    { name: "React", icon: "react" },
    { name: "Next.js", icon: "nextdotjs" },
    { name: "TypeScript", icon: "typescript" },
    { name: "Three.js", icon: "threedotjs" },
    { name: "Node.js", icon: "nodedotjs" },
    { name: "NestJS", icon: "nestjs" },
    { name: "Go", icon: "go" },
    { name: "Docker", icon: "docker" },
  ] as StackItem[],
  showLabel: true, // show the name above each crate
  showCounter: true, // counter of crates jumped
  iconSize: 20,
  iconDir: "icons",
  width: 840,
  height: 176,
  groundY: 150,
  px: 4, // size of one "pixel"
  gap: 200, // distance between crates (px)
  speed: 160, // scroll speed (px/s)
  heroX: 90,
  jumpH: 84,
  stepTime: 0.24, // walk cycle duration (s)
};

// ---------- Sprite ----------
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
const TIMES = ["...", "#.#", ".#.", "#.#", "..."];

// ---------- Theme ----------
type Theme = Record<
  | "body"
  | "visor"
  | "eye"
  | "accent"
  | "crate"
  | "wood"
  | "icon"
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
const mod = (a: number, n: number) => ((a % n) + n) % n;
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
      out += `<rect x="${x + rx * s}" y="${y + ry * s}" width="${len * s}" height="${s}" fill="${pal[c]}"/>`;
      rx += len;
    }
  });
  return out;
}

// ---------- Icon ----------
// keepColor = true for your own files (original colors kept), false for simple-icons (tinted by theme).
type Icon = { symbol: string; keepColor: boolean };

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
      symbol: `<symbol id="${id}" viewBox="${viewBox}">${inner}</symbol>`,
      keepColor: true,
    };
  }

  const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
  const si = (simpleIcons as Record<string, { path: string } | undefined>)[key];
  if (si?.path) {
    return {
      symbol: `<symbol id="${id}" viewBox="0 0 24 24"><path d="${si.path}"/></symbol>`,
      keepColor: false,
    };
  }

  console.warn(`! Icon "${slug}" not found — using an X crate`);
  return null;
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
    const w = (j - i) * col;
    out += `<rect x="${cols[i].x}" y="${groundY - cols[i].h}" width="${w}" height="${cols[i].h}" fill="${color}"/>`;
    i = j;
  }
  return out;
}

// ---------- Build ----------
const icons = CONFIG.stack.map((item, i) => loadIcon(item.icon, `ic${i}`));

function build(t: Theme) {
  const {
    width: W,
    height: H,
    groundY,
    px,
    gap,
    speed,
    heroX,
    jumpH,
    stack,
    stepTime,
    iconSize,
    showLabel,
    showCounter,
  } = CONFIG;

  const heroW = HERO_TOP[0].length * px;
  const heroH = (HERO_TOP.length + LEGS_A.length) * px;
  const heroY = groundY - heroH;
  const crateW = CRATE_X[0].length * px;
  const crateH = CRATE_X.length * px;

  const defs = icons.map((ic) => ic?.symbol ?? "").join("");

  // Obstacle strip: duplicated so the scroll loops seamlessly
  const N = stack.length;
  const stripLen = N * gap;
  const stripDur = stripLen / speed;
  const startX = 40;

  let strip = "";
  for (let k = 0; k < N * 2; k++) {
    const i = k % N;
    const x = startX + k * gap;
    const y = groundY - crateH;
    const ic = icons[i];

    strip += sprite(
      ic ? CRATE_PLAIN : CRATE_X,
      { "#": t.crate, w: t.wood },
      x,
      y,
    );
    if (ic) {
      const ix = x + (crateW - iconSize) / 2;
      const iy = y + (crateH - iconSize) / 2;
      const fill = ic.keepColor ? "" : ` fill="${t.icon}"`;
      strip += `<use href="#ic${i}" x="${ix}" y="${iy}" width="${iconSize}" height="${iconSize}"${fill} class="icon"/>`;
    }
    if (showLabel) {
      strip += `<text x="${x + crateW / 2}" y="${y - 8}" class="label">${esc(stack[i].name)}</text>`;
    }
    // pebbles on the ground
    strip += `<rect x="${x + 70}" y="${groundY + 8}" width="${px * 2}" height="${px}" fill="${t.ground}"/>`;
    strip += `<rect x="${x + 135}" y="${groundY + 14}" width="${px}" height="${px}" fill="${t.ground}"/>`;
  }

  // Jump period = time for one crate to pass; phase is set so the jump peak happens right above a crate
  const P = gap / speed;
  const t0 = mod(startX + crateW / 2 - (heroX + heroW / 2), gap) / speed;
  const jumpShift = mod(0.5 * P - t0, P); // animation-delay = -jumpShift

  // Clouds and hills scroll slower (parallax)
  const clouds = [
    [150, 34],
    [470, 22],
    [700, 44],
  ];
  let cloudStrip = "";
  let hillStrip = "";
  for (const off of [0, W]) {
    for (const [cx, cy] of clouds)
      cloudStrip += sprite(CLOUD, { "#": t.cloud }, cx + off, cy, 3);
    hillStrip += `<g transform="translate(${off} 0)">${hills(W, groundY, t.hill, px)}</g>`;
  }

  // Counter: each digit is a vertical 0..9 column, clipped by a clipPath and moved with steps(10).
  // The ones digit ticks every P seconds, right when the robot lands (80% of the jump cycle).
  let hud = "";
  let hudCss = "";
  if (showCounter) {
    const ds = 3; // pixel size of the digit font
    const dW = 3 * ds;
    const dH = 5 * ds;
    const step = dH + ds * 2; // distance between digits in the column
    const digits = 4;
    const right = W - 20;
    const top = 16;
    const landShift = mod(-(0.8 * P - jumpShift), P); // so each tick lands on the touchdown

    const numX = right - digits * (dW + ds) + ds;
    let col = "";
    for (let n = 0; n < 10; n++)
      col += sprite(DIGITS[n], { "#": t.hud }, 0, n * step, ds);

    for (let d = 0; d < digits; d++) {
      const x = numX + d * (dW + ds);
      const place = digits - 1 - d; // 0 = ones digit
      hud += `<clipPath id="dg${d}"><rect x="${x}" y="${top}" width="${dW}" height="${dH}"/></clipPath>`;
      hud += `<g clip-path="url(#dg${d})"><g transform="translate(${x} ${top})"><g class="d${d}">${col}</g></g></g>`;
      hudCss += `.d${d} { animation: roll ${r(P * 10 ** (place + 1))}s steps(10, end) infinite; animation-delay: -${r(landShift)}s; }\n  `;
    }
    hud += sprite(TIMES, { "#": t.hud }, numX - 4 * ds - ds, top, ds);
    const mini = 2;
    hud += sprite(
      CRATE_X,
      { "#": t.crate, w: t.wood },
      numX - 4 * ds - ds - 9 * mini - 6,
      top - 0.5,
      mini,
    );
    hudCss += `@keyframes roll { to { transform: translateY(-${10 * step}px); } }`;
  }

  const heroPal = { "#": t.body, v: t.visor, e: t.eye, a: t.accent };
  const legsY = heroY + HERO_TOP.length * px;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
<defs>${defs}</defs>
<style>
  .label { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; text-anchor: middle;
           font-size: 12px; font-weight: 600; fill: ${t.label}; }
  .icon { shape-rendering: geometricPrecision; }

  .strip { animation: scroll ${r(stripDur)}s linear infinite; }
  @keyframes scroll { to { transform: translateX(-${stripLen}px); } }

  .hills { animation: pan ${r(W / (speed / 4))}s linear infinite; }
  .clouds { animation: pan ${r(W / (speed / 8))}s linear infinite; }
  @keyframes pan { to { transform: translateX(-${W}px); } }

  .hero { animation: jump ${r(P)}s linear infinite; animation-delay: -${r(jumpShift)}s; }
  @keyframes jump {
    0%, 20% { transform: translateY(0); animation-timing-function: cubic-bezier(.33,.66,.66,1); }
    50% { transform: translateY(-${jumpH}px); animation-timing-function: cubic-bezier(.33,0,.66,.33); }
    80%, 100% { transform: translateY(0); }
  }

  .legA, .legB { animation: step ${stepTime}s steps(1, end) infinite; }
  .legB { opacity: 0; animation-delay: -${stepTime / 2}s; }
  @keyframes step { 0% { opacity: 1; } 50% { opacity: 0; } }

  ${hudCss}

  @media (prefers-reduced-motion: reduce) {
    .strip, .hills, .clouds, .hero, .legA, .legB, [class^="d"] { animation: none; }
  }
</style>
<g class="clouds">${cloudStrip}</g>
<g class="hills">${hillStrip}</g>
<rect x="0" y="${groundY}" width="${W}" height="2" fill="${t.ground}"/>
<g class="strip">${strip}</g>
<g class="hero">
  ${sprite(HERO_TOP, heroPal, heroX, heroY)}
  <g class="legA">${sprite(LEGS_A, heroPal, heroX, legsY)}</g>
  <g class="legB">${sprite(LEGS_B, heroPal, heroX, legsY)}</g>
</g>
${hud}
</svg>
`;
}

for (const name of ["dark", "light"] as const) {
  writeFileSync(`hero-${name}.svg`, build(THEMES[name]));
  console.log(`✓ hero-${name}.svg`);
}
