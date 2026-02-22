// tools/generate-camping-caravan.mjs
// Snake-like "hiker" animation across GitHub contributions grid,
// with a tent at the final cell + campfires with smoke.
//
// Outputs:
//   dist/assets/camping-caravan-dark.svg
//   dist/assets/camping-caravan-light.svg

import fs from "fs";
import path from "path";

const LOGIN = process.env.GITHUB_LOGIN || "lakisicaslt";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN env var.");
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), "dist", "assets");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${TOKEN}`,
      "User-Agent": "camping-hiker-generator",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error("GitHub GraphQL query failed");
  }
  return json.data;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function buildThresholds(counts) {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [0, 1, 2, 3];
  const q1 = Math.max(1, Math.round(quantile(nz, 0.25)));
  const q2 = Math.max(q1 + 1, Math.round(quantile(nz, 0.50)));
  const q3 = Math.max(q2 + 1, Math.round(quantile(nz, 0.75)));
  const q4 = Math.max(q3 + 1, Math.round(quantile(nz, 0.90)));
  return [q1, q2, q3, q4];
}

function levelFor(count, t) {
  if (count <= 0) return 0;
  if (count <= t[0]) return 1;
  if (count <= t[1]) return 2;
  if (count <= t[2]) return 3;
  return 4;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// pick a few "campfire" cells: prefer lvl>=3, then lvl>=2
function pickCampfires(highCells, max = 4) {
  const lvl3 = highCells.filter((c) => c.lvl >= 3);
  const lvl2 = highCells.filter((c) => c.lvl === 2);

  const picked = [];
  // take from the most recent activity (end of list is recent)
  for (let i = lvl3.length - 1; i >= 0 && picked.length < max; i--) picked.push(lvl3[i]);
  for (let i = lvl2.length - 1; i >= 0 && picked.length < max; i--) picked.push(lvl2[i]);

  // ensure unique x,y
  const seen = new Set();
  return picked.filter((c) => {
    const k = `${c.x},${c.y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function svgForTheme(calendar, theme) {
  const weeks = calendar.weeks || [];
  const W = weeks.length;

  // Sizing
  const cell = 12;
  const gap = 3;
  const pad = 18;

  const width = pad * 2 + W * (cell + gap) - gap;
  const height = pad * 2 + 7 * (cell + gap) - gap;

  // Collect counts for thresholds
  const counts = [];
  for (const w of weeks) {
    for (const d of (w.contributionDays || [])) {
      if (d && typeof d.contributionCount === "number") counts.push(d.contributionCount);
    }
  }
  const thresholds = buildThresholds(counts);

  const palettes = {
    dark: {
      bg: "#0d1117",
      grid0: "#161b22",
      grid1: "#0e4429",
      grid2: "#006d32",
      grid3: "#26a641",
      grid4: "#39d353",
      text: "#c9d1d9",
      path: "rgba(255,255,255,0.10)",
      dash: "rgba(57,211,83,0.55)",
      dashGlow: "rgba(57,211,83,0.25)",
      hiker: "#c9d1d9",
      tent: "#c9d1d9",
      tentFill: "rgba(31,111,235,0.35)",
      fire1: "#ffb74d",
      fire2: "#ff7043",
      smoke: "rgba(255,255,255,0.55)",
    },
    light: {
      bg: "#ffffff",
      grid0: "#ebedf0",
      grid1: "#9be9a8",
      grid2: "#40c463",
      grid3: "#30a14e",
      grid4: "#216e39",
      text: "#24292f",
      path: "rgba(0,0,0,0.10)",
      dash: "rgba(48,161,78,0.55)",
      dashGlow: "rgba(48,161,78,0.20)",
      hiker: "#24292f",
      tent: "#24292f",
      tentFill: "rgba(9,105,218,0.22)",
      fire1: "#ff9800",
      fire2: "#ff5722",
      smoke: "rgba(0,0,0,0.35)",
    },
  };

  const p = palettes[theme];

  // Grid + collect high activity cells
  let rects = "";
  const highCells = [];

  for (let x = 0; x < W; x++) {
    const days = weeks[x].contributionDays || [];
    for (let y = 0; y < 7; y++) {
      const day = days[y];

      const rx = pad + x * (cell + gap);
      const ry = pad + y * (cell + gap);

      if (!day) {
        rects += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="3" ry="3" fill="${p.grid0}"></rect>\n`;
        continue;
      }

      const lvl = levelFor(day.contributionCount, thresholds);
      const fill = [p.grid0, p.grid1, p.grid2, p.grid3, p.grid4][lvl];

      if (lvl >= 2) {
        highCells.push({ x, y, lvl, date: day.date, count: day.contributionCount });
      }

      rects += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="3" ry="3" fill="${fill}">
  <title>${escapeXml(day.date)} • ${day.contributionCount} contributions</title>
</rect>\n`;
    }
  }

  // Snake path through every cell (no diagonals)
  const points = [];
  for (let x = 0; x < W; x++) {
    const ys = x % 2 === 0 ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
    for (const y of ys) {
      const px = pad + x * (cell + gap) + cell / 2;
      const py = pad + y * (cell + gap) + cell / 2;
      points.push({ px, py, x, y });
    }
  }

  const pathD = "M " + points.map((pt) => `${pt.px.toFixed(2)} ${pt.py.toFixed(2)}`).join(" L ");

  const durationSec = Math.min(26, Math.max(14, Math.round((W * 7) / 20)));

  // Final cell (tent)
  const end = points[points.length - 1];
  const tentX = end.px;
  const tentY = end.py;

  // Pick campfires positions
  const fires = pickCampfires(highCells, 4).map((c, idx) => {
    const cx = pad + c.x * (cell + gap) + cell / 2;
    const cy = pad + c.y * (cell + gap) + cell / 2;
    return { cx, cy, idx };
  });

  // Hiker icon (simple, readable): head + body + backpack + trekking pole
  const hikerIcon = `
    <g id="hiker" transform="translate(-8,-10)" stroke="${p.hiker}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <circle cx="8" cy="4.5" r="2.1" fill="${p.hiker}" stroke="none" opacity="0.95"/>
      <path d="M8 7.2v5.3" />
      <path d="M8 10.2l-3.2 2.3" />
      <path d="M8 10.2l3.1 2.0" />
      <path d="M8 12.5l-2.6 5.2" />
      <path d="M8 12.5l2.9 5.2" />
      <!-- backpack -->
      <path d="M10.6 8.8c1.3.5 2.0 1.6 2.0 3.0v2.3c0 .5-.4.9-.9.9h-1.1" />
      <!-- trekking pole -->
      <path d="M3.2 12.5l0 7.0" />
      <path d="M2.5 19.5h1.4" />
    </g>
  `;

  // Tent icon at the end (fixed)
  const tentIcon = `
    <g id="tent" transform="translate(${tentX.toFixed(2)} ${tentY.toFixed(2)}) translate(-11,-10)">
      <path d="M2 18L11 3l9 15H2z" fill="${p.tentFill}" stroke="${p.tent}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M11 3v15" stroke="${p.tent}" stroke-width="1.2" opacity="0.75"/>
      <path d="M9.6 18c.3-3.6 1.1-6.2 1.4-6.2s1.1 2.6 1.4 6.2" fill="none" stroke="${p.tent}" stroke-width="1.1" opacity="0.85"/>
    </g>
  `;

  // Campfire + smoke
  // Each fire has 3 smoke puffs rising & fading, looped.
  function fireGroup(cx, cy, idx) {
    const id = `fire${idx}`;
    const delay = (idx * 0.4).toFixed(2);
    return `
      <g id="${id}" transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) translate(-10,-8)">
        <!-- logs -->
        <path d="M3 15l6-3" stroke="${p.text}" stroke-width="1.2" opacity="0.35" stroke-linecap="round"/>
        <path d="M17 15l-6-3" stroke="${p.text}" stroke-width="1.2" opacity="0.35" stroke-linecap="round"/>
        <!-- flame -->
        <path d="M10.5 5.5c1.2 1.7.9 3.1-.2 4.2.4-.2 1.5-.8 1.8-2 .6 1.2 1.1 3.4-.6 5.0-1.2 1.1-3.3 1.1-4.5-.2-1.3-1.4-1.1-3.7.6-5.5-.2 1.4.6 2.2 1.6 2.6-1.3-1.6-.8-2.9 1.3-4.1z"
              fill="${p.fire2}" opacity="0.95"/>
        <path d="M10.4 7.0c.7 1 .5 1.8-.1 2.4.3-.1.8-.4 1.0-1.1.4.7.6 2.0-.3 2.9-.7.6-1.9.6-2.6-.1-.7-.8-.6-2.1.3-3.2-.1.8.3 1.3.9 1.5-.7-.9-.4-1.6.8-2.4z"
              fill="${p.fire1}" opacity="0.95"/>

        <!-- smoke puffs -->
        <g opacity="0.9">
          ${[0, 1, 2]
            .map((k) => {
              const dx = k === 0 ? -2 : k === 1 ? 0 : 2;
              const dur = (2.6 + k * 0.4).toFixed(2);
              const begin = `${delay}s`;
              return `
                <circle cx="${10 + dx}" cy="4" r="${1.6 - k * 0.1}"
                        fill="${p.smoke}" opacity="0.0">
                  <animate attributeName="opacity" values="0;0.55;0" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/>
                  <animateTransform attributeName="transform" type="translate"
                    values="0 0; ${dx * 0.6} -10" dur="${dur}s" begin="${begin}" repeatCount="indefinite"/>
                </circle>
              `;
            })
            .join("\n")}
        </g>
      </g>
    `;
  }

  const firesSvg = fires.map((f) => fireGroup(f.cx, f.cy, f.idx)).join("\n");

  // SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}" role="img" aria-label="Camping trail with hiker, campfires, and tent">
  <defs>
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="${p.bg}" rx="12" />

  <!-- Contribution grid -->
  <g>
    ${rects}
  </g>

  <!-- Context path (subtle) -->
  <path d="${pathD}" fill="none" stroke="${p.path}" stroke-width="1.6" stroke-linecap="round" />

  <!-- Animated highlight dash (snake-like vibe) -->
  <path d="${pathD}" fill="none" stroke="${p.dash}" stroke-width="2.6" stroke-linecap="round"
        stroke-dasharray="18 140" filter="url(#softGlow)">
    <animate attributeName="stroke-dashoffset" values="0; -9000" dur="${durationSec}s" repeatCount="indefinite"/>
  </path>

  <!-- Campfires with smoke -->
  <g>
    ${firesSvg}
  </g>

  <!-- Tent at the last cell -->
  <g>
    ${tentIcon}
  </g>

  <!-- Hiker moving along the snake path -->
  <g>
    ${hikerIcon}
    <use href="#hiker">
      <animateMotion dur="${durationSec}s" repeatCount="indefinite" rotate="auto">
        <mpath href="#motionPath"/>
      </animateMotion>
    </use>
  </g>

  <path id="motionPath" d="${pathD}" fill="none" stroke="none"/>

  <text x="${pad}" y="${height - 8}"
        font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
        font-size="12" fill="${p.text}" opacity="0.85">
    🏕️ ${LOGIN} • camping trail
  </text>
</svg>
`;
  return svg;
}

async function main() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await gql(query, { login: LOGIN });
  const calendar = data.user.contributionsCollection.contributionCalendar;

  const darkSvg = svgForTheme(calendar, "dark");
  const lightSvg = svgForTheme(calendar, "light");

  fs.writeFileSync(path.join(OUT_DIR, "camping-caravan-dark.svg"), darkSvg, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, "camping-caravan-light.svg"), lightSvg, "utf8");

  console.log("Generated SVGs: dist/assets/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
