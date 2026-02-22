// tools/generate-camping-caravan.mjs
// Generates animated SVG "camping caravan" over GitHub contribution calendar.
// Output:
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
      "User-Agent": "camping-caravan-generator",
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
  if (nz.length === 0) return [0, 1, 2, 3]; // fallback

  // Use quartiles of non-zero days to approximate GitHub intensity levels
  const q1 = Math.max(1, Math.round(quantile(nz, 0.25)));
  const q2 = Math.max(q1 + 1, Math.round(quantile(nz, 0.50)));
  const q3 = Math.max(q2 + 1, Math.round(quantile(nz, 0.75)));
  const q4 = Math.max(q3 + 1, Math.round(quantile(nz, 0.90)));
  return [q1, q2, q3, q4];
}

function levelFor(count, t) {
  // 0..4
  if (count <= 0) return 0;
  if (count <= t[0]) return 1;
  if (count <= t[1]) return 2;
  if (count <= t[2]) return 3;
  return 4;
}

function escapeXml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgForTheme(calendar, theme) {
  // Calendar layout: weeks (columns) x 7 days (rows)
  // We'll render like GitHub: Sunday=0 at top.
  const weeks = calendar.weeks;
  const W = weeks.length;

  const cell = 12;
  const gap = 3;
  const pad = 18;

  const width = pad * 2 + W * (cell + gap) - gap;
  const height = pad * 2 + 7 * (cell + gap) - gap;

  const counts = [];
for (const w of weeks) {
  for (const d of (w.contributionDays || [])) {
    if (d && typeof d.contributionCount === "number") counts.push(d.contributionCount);
  }
}  const thresholds = buildThresholds(counts);

  const palettes = {
    dark: {
      bg: "#0d1117",
      grid0: "#161b22",
      grid1: "#0e4429",
      grid2: "#006d32",
      grid3: "#26a641",
      grid4: "#39d353",
      text: "#c9d1d9",
      trail: "rgba(255,255,255,0.22)",
      trailGlow: "rgba(57,211,83,0.35)",
    },
    light: {
      bg: "#ffffff",
      grid0: "#ebedf0",
      grid1: "#9be9a8",
      grid2: "#40c463",
      grid3: "#30a14e",
      grid4: "#216e39",
      text: "#24292f",
      trail: "rgba(0,0,0,0.18)",
      trailGlow: "rgba(48,161,78,0.25)",
    },
  };

  const p = palettes[theme];

  // Collect "active" points in chronological order (date ascending)
  const points = [];
  for (let x = 0; x < W; x++) {
  const days = weeks[x].contributionDays || [];

  // GitHub ponekad vrati <7 dana u nedelji na početku/kraju perioda
  for (let y = 0; y < 7; y++) {
    const day = days[y];
    if (!day) continue; // skip missing slots

    points.push({
      date: day.date,
      count: day.contributionCount,
      x,
      y,
    });
  }
}

  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Use last N active (count>0) days for trail. Keeps animation nice.
  const active = points.filter((pt) => pt.count > 0);
  const N = 90;
  const trailPts = (active.length > N ? active.slice(active.length - N) : active);

  // If no activity, do a small loop in the middle so SVG still animates
  const fallbackMidX = Math.floor(W / 2);
  const fallback = [
    { x: fallbackMidX, y: 3 },
    { x: fallbackMidX + 1, y: 3 },
    { x: fallbackMidX + 1, y: 4 },
    { x: fallbackMidX, y: 4 },
    { x: fallbackMidX, y: 3 },
  ];

  const animPts = (trailPts.length >= 2 ? trailPts : fallback).map((pt) => {
    const px = pad + pt.x * (cell + gap) + cell / 2;
    const py = pad + pt.y * (cell + gap) + cell / 2;
    return { px, py };
  });

  // Build path "M x y L x y ..."
  const pathD =
    "M " +
    animPts
      .map((pt, i) => `${pt.px.toFixed(2)} ${pt.py.toFixed(2)}`.trim())
      .join(" L ");

  // Animation duration scales slightly with path length
  const durationSec = Math.min(18, Math.max(8, Math.round(animPts.length * 0.18)));

  // Caravan icon (tiny camper van) as SVG paths
  // It's intentionally simple so it scales cleanly.
  const caravan = `
    <g id="caravan" transform="translate(-7,-6)">
      <path d="M2 8.5c0-1.4 1.1-2.5 2.5-2.5h6.2c1 0 1.9.6 2.3 1.5l.9 2h2.1c1 0 1.9.8 1.9 1.9v2.1c0 .9-.7 1.6-1.6 1.6H17" fill="${p.text}" opacity="0.95"/>
      <path d="M4.2 6h6.3c.7 0 1.3.4 1.6 1l.9 2H3.7V6.5c0-.3.2-.5.5-.5z" fill="${theme === "dark" ? "#1f6feb" : "#0969da"}" opacity="0.9"/>
      <circle cx="6" cy="15" r="1.7" fill="${p.bg}" opacity="0.95"/>
      <circle cx="6" cy="15" r="1.1" fill="${p.text}" opacity="0.95"/>
      <circle cx="14.2" cy="15" r="1.7" fill="${p.bg}" opacity="0.95"/>
      <circle cx="14.2" cy="15" r="1.1" fill="${p.text}" opacity="0.95"/>
      <path d="M2.6 13.2h14.8" stroke="${p.bg}" stroke-width="1" opacity="0.35"/>
    </g>
  `;

  // Render contribution cells
  let rects = "";
  for (let x = 0; x < W; x++) {
    const days = weeks[x].contributionDays;
    for (let y = 0; y < 7; y++) {
      const day = days[y];
      const lvl = levelFor(day.contributionCount, thresholds);
      const fill = [p.grid0, p.grid1, p.grid2, p.grid3, p.grid4][lvl];

      const rx = pad + x * (cell + gap);
      const ry = pad + y * (cell + gap);

      rects += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="3" ry="3" fill="${fill}">
  <title>${escapeXml(day.date)} • ${day.contributionCount} contributions</title>
</rect>\n`;
    }
  }

  // Trail line: draw the path with animated dash (gives “moving” feel)
  // plus the caravan moving along the same path.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}" role="img" aria-label="Camping caravan activity trail">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="1.8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="${p.bg}" rx="12" />

  <!-- Contribution grid -->
  <g>
    ${rects}
  </g>

  <!-- Animated trail -->
  <g>
    <path d="${pathD}" fill="none" stroke="${p.trail}" stroke-width="2.2" stroke-linecap="round"
          stroke-dasharray="6 8">
      <animate attributeName="stroke-dashoffset" values="0; -56" dur="${durationSec}s" repeatCount="indefinite"/>
    </path>

    <path d="${pathD}" fill="none" stroke="${p.trailGlow}" stroke-width="3.4" stroke-linecap="round"
          opacity="0.55" filter="url(#glow)" stroke-dasharray="10 16">
      <animate attributeName="stroke-dashoffset" values="0; -104" dur="${durationSec}s" repeatCount="indefinite"/>
    </path>
  </g>

  <!-- Caravan moving along trail -->
  <g>
    ${caravan}
    <use href="#caravan">
      <animateMotion dur="${durationSec}s" repeatCount="indefinite" rotate="auto">
        <mpath href="#motionPath"/>
      </animateMotion>
    </use>

    <path id="motionPath" d="${pathD}" fill="none" stroke="none"/>
  </g>

  <!-- Caption -->
  <text x="${pad}" y="${height - 8}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
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

  console.log("Generated:", path.join("dist", "assets", "camping-caravan-dark.svg"));
  console.log("Generated:", path.join("dist", "assets", "camping-caravan-light.svg"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
