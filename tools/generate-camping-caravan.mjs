// tools/generate-camping-caravan.mjs
// Snake-like animated camper van over GitHub contribution grid.
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
      "User-Agent": "camping-camper-van-generator",
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

function svgForTheme(calendar, theme) {
  const weeks = calendar.weeks || [];
  const W = weeks.length;

  // Grid sizing (looks good on GitHub README)
  const cell = 12;
  const gap = 3;
  const pad = 18;

  const width = pad * 2 + W * (cell + gap) - gap;
  const height = pad * 2 + 7 * (cell + gap) - gap;

  // Collect counts to compute thresholds
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
      trail: "rgba(255,255,255,0.12)",     // faint full path
      dash: "rgba(57,211,83,0.55)",        // moving highlight
      dashGlow: "rgba(57,211,83,0.28)",
      vanBody: "#c9d1d9",
      vanStroke: "rgba(0,0,0,0.30)",
      vanAccent: "#1f6feb",
      vanWindow: "rgba(13,17,23,0.85)",
      vanLight: "rgba(255, 224, 128, 0.85)",
    },
    light: {
      bg: "#ffffff",
      grid0: "#ebedf0",
      grid1: "#9be9a8",
      grid2: "#40c463",
      grid3: "#30a14e",
      grid4: "#216e39",
      text: "#24292f",
      trail: "rgba(0,0,0,0.10)",
      dash: "rgba(48,161,78,0.55)",
      dashGlow: "rgba(48,161,78,0.22)",
      vanBody: "#24292f",
      vanStroke: "rgba(0,0,0,0.28)",
      vanAccent: "#0969da",
      vanWindow: "rgba(255,255,255,0.80)",
      vanLight: "rgba(255, 224, 128, 0.70)",
    },
  };

  const p = palettes[theme];

  // Draw contribution grid (handles partial weeks by drawing empties)
  let rects = "";
  let highCells = []; // for optional trees/markers

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

      // collect some “camp vibe” points from higher activity cells
      if (lvl >= 3) {
        highCells.push({ x, y, lvl, date: day.date, count: day.contributionCount });
      }

      rects += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="3" ry="3" fill="${fill}">
  <title>${escapeXml(day.date)} • ${day.contributionCount} contributions</title>
</rect>\n`;
    }
  }

  // Build a SNAKE path across the entire grid (no diagonals):
  // column 0 top->bottom, column 1 bottom->top, etc.
  const points = [];
  for (let x = 0; x < W; x++) {
    const ys = x % 2 === 0 ? [0,1,2,3,4,5,6] : [6,5,4,3,2,1,0];
    for (const y of ys) {
      const px = pad + x * (cell + gap) + cell / 2;
      const py = pad + y * (cell + gap) + cell / 2;
      points.push({ px, py });
    }
  }

  const pathD = "M " + points.map((pt) => `${pt.px.toFixed(2)} ${pt.py.toFixed(2)}`).join(" L ");

  // Duration: longer grid => longer animation, but keep within nice bounds
  const durationSec = Math.min(26, Math.max(14, Math.round((W * 7) / 20)));

  // Small set of “camp” markers: a few trees on high-activity cells
  // Keep it sparse so it stays clean.
  const maxTrees = 10;
  highCells = highCells.slice(-maxTrees);

  const trees = highCells
    .map(({ x, y }) => {
      const cx = pad + x * (cell + gap) + cell / 2;
      const cy = pad + y * (cell + gap) + cell / 2;
      return `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" opacity="0.65">🌲</text>`;
    })
    .join("\n");

  // Camper van icon (actually looks like a camper van: body, roof, window, door, wheels, headlight)
  // Drawn around (0,0); we’ll offset via translate and animateMotion.
  const camperVan = `
    <g id="camper-van" transform="translate(-11,-9)">
      <!-- Body -->
      <path d="M3 12.2c0-2 1.6-3.6 3.6-3.6h9.2c1.5 0 2.8.9 3.4 2.3l1.1 2.4h2.7c1.5 0 2.8 1.2 2.8 2.8v2.8c0 1.2-1 2.2-2.2 2.2H24.8"
            fill="${p.vanBody}" opacity="0.92" stroke="${p.vanStroke}" stroke-width="0.6" stroke-linejoin="round"/>
      <!-- Roof / pop-top -->
      <path d="M7.2 7.6h7.4c1.1 0 2 .9 2 2v1.1H5.2V9.6c0-1.1.9-2 2-2z"
            fill="${p.vanAccent}" opacity="0.92" stroke="${p.vanStroke}" stroke-width="0.6" stroke-linejoin="round"/>
      <!-- Window -->
      <path d="M7.0 11.0h7.6c.6 0 1.1.5 1.1 1.1v2.1H5.9v-2.1c0-.6.5-1.1 1.1-1.1z"
            fill="${p.vanWindow}" opacity="0.90"/>
      <!-- Door line -->
      <path d="M13.3 11.0v6.2" stroke="${p.vanStroke}" stroke-width="0.7" opacity="0.55"/>
      <!-- Wheels -->
      <circle cx="9.0" cy="20.4" r="2.4" fill="${p.bg}" opacity="0.96"/>
      <circle cx="9.0" cy="20.4" r="1.5" fill="${p.vanBody}" opacity="0.92"/>
      <circle cx="19.2" cy="20.4" r="2.4" fill="${p.bg}" opacity="0.96"/>
      <circle cx="19.2" cy="20.4" r="1.5" fill="${p.vanBody}" opacity="0.92"/>
      <!-- Headlight -->
      <circle cx="24.8" cy="17.4" r="0.9" fill="${p.vanLight}" opacity="0.9"/>
    </g>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}" role="img" aria-label="Camping camper van activity trail">
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

  <!-- Subtle trees (camp vibe) -->
  <g>
    ${trees}
  </g>

  <!-- Full snake path (very faint, just for context) -->
  <path d="${pathD}" fill="none" stroke="${p.trail}" stroke-width="1.6" stroke-linecap="round" />

  <!-- Moving highlight dash (the “animated trail”) -->
  <path d="${pathD}" fill="none" stroke="${p.dash}" stroke-width="2.6" stroke-linecap="round"
        stroke-dasharray="16 120" filter="url(#softGlow)">
    <animate attributeName="stroke-dashoffset" values="0; -9000" dur="${durationSec}s" repeatCount="indefinite"/>
  </path>

  <!-- Camper van moving along the snake path -->
  <g>
    ${camperVan}
    <use href="#camper-van">
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

  console.log("Generated SVGs in dist/assets/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
