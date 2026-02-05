import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const SERVER_BASE = process.env.BENCH_SERVER_BASE || "http://localhost:8090";
const CLIENT_BASE = process.env.BENCH_CLIENT_BASE || "http://localhost:5173";
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS || "3", 10);
const TIMEOUT_MS = Number.parseInt(process.env.BENCH_TIMEOUT_MS || "600000", 10);
const HEADLESS = process.env.BENCH_HEADLESS === "true";
const REPORT_PATH = process.env.BENCH_REPORT_PATH || path.join(repoRoot, "client", "reports", "benchmark-report.html");

const SIZE_PRESETS = [
  { id: "small", label: "Small (1k)" },
  { id: "medium", label: "Medium (10k)" },
  { id: "large", label: "Large (50k)" }
];

const FORMAT_LABELS = {
  orgjson: "org.json",
  jacksonstream: "Jackson Streaming",
  flexbuffers: "FlexBuffers",
  flatbuffers: "FlatBuffers",
  messagepack: "MessagePack",
  cbor: "CBOR",
  arrow: "Apache Arrow"
};

const FORMAT_ORDER = Object.keys(FORMAT_LABELS);

const running = [];

function spawnProcess(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: "inherit" });
  running.push(child);
  return child;
}

async function waitForHttp(url, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Ignore until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function shutdown() {
  for (const child of running) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(1);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(1);
});

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeStats(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) {
    return { mean: null, median: null, p95: null, count: 0 };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const p95Index = Math.floor(0.95 * (sorted.length - 1));
  const p95 = sorted[p95Index];
  return { mean, median, p95, count: sorted.length };
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(digits);
}

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Math.round(Number(value)).toString();
}

function formatBytes(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  const bytes = Number(value);
  const abs = Math.abs(bytes);
  if (abs < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (abs < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (abs < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildAggregates(runs) {
  const aggregates = {};
  for (const run of runs) {
    const size = run.sizePreset;
    if (!aggregates[size]) {
      aggregates[size] = {};
    }
    for (const result of run.results) {
      const formatId = result.formatId;
      if (!aggregates[size][formatId]) {
        aggregates[size][formatId] = {
          formatId,
          endToEndMs: [],
          parseMs: [],
          serverSerializeMs: [],
          payloadBytes: [],
          serverPayloadBytes: [],
          errors: 0
        };
      }
      const bucket = aggregates[size][formatId];
      if (result.status !== "ok") {
        bucket.errors += 1;
        continue;
      }
      bucket.endToEndMs.push(toNumber(result.endToEndMs));
      bucket.parseMs.push(toNumber(result.parseMs));
      const serverNanos = toNumber(result.serverSerializeNanos);
      bucket.serverSerializeMs.push(serverNanos === null ? null : serverNanos / 1e6);
      bucket.payloadBytes.push(toNumber(result.payloadBytes));
      bucket.serverPayloadBytes.push(toNumber(result.serverPayloadBytes));
    }
  }
  return aggregates;
}

function createReportHtml(reportData) {
  const timestamp = new Date(reportData.generatedAt).toISOString();
  const sizes = reportData.sizes;
  const sizeRankings = sizes.map((size) => {
    const rows = reportData.aggregates[size] || [];
    const ranked = rows
      .filter((row) => row.endToEnd.mean !== null && row.endToEnd.mean !== undefined)
      .slice()
      .sort((a, b) => a.endToEnd.mean - b.endToEnd.mean);
    return { size, ranked };
  });

  const overallMap = new Map();
  for (const size of sizes) {
    const rows = reportData.aggregates[size] || [];
    for (const row of rows) {
      if (row.endToEnd.mean === null || row.endToEnd.mean === undefined) {
        continue;
      }
      const existing = overallMap.get(row.formatId) || {
        formatId: row.formatId,
        label: row.label,
        sum: 0,
        count: 0,
        payloadSum: 0,
        payloadCount: 0,
        errors: 0
      };
      existing.sum += row.endToEnd.mean;
      existing.count += 1;
      if (row.payload.mean !== null && row.payload.mean !== undefined) {
        existing.payloadSum += row.payload.mean;
        existing.payloadCount += 1;
      }
      existing.errors += row.errors || 0;
      overallMap.set(row.formatId, existing);
    }
  }

  const overallRanked = [...overallMap.values()]
    .map((entry) => ({
      ...entry,
      avg: entry.count ? entry.sum / entry.count : null,
      avgPayload: entry.payloadCount ? entry.payloadSum / entry.payloadCount : null
    }))
    .filter((entry) => entry.avg !== null)
    .sort((a, b) => a.avg - b.avg);

  const sizeWinners = new Map();
  for (const ranking of sizeRankings) {
    const winner = ranking.ranked[0];
    if (winner) {
      sizeWinners.set(winner.formatId, (sizeWinners.get(winner.formatId) || 0) + 1);
    }
  }
  const mostWins = [...sizeWinners.entries()]
    .sort((a, b) => b[1] - a[1])[0];

  const payloadWinner = overallRanked
    .filter((entry) => entry.avgPayload !== null)
    .sort((a, b) => a.avgPayload - b.avgPayload)[0];

  const errorFormats = overallRanked.filter((entry) => entry.errors > 0);
  const totalErrors = overallRanked.reduce((sum, entry) => sum + (entry.errors || 0), 0);
  const errorList = errorFormats.map((entry) => entry.label).join(", ");

  const sizeHighlights = sizes.map((size) => {
    const rows = reportData.aggregates[size] || [];
    const successful = rows
      .filter((row) => row.endToEnd.mean !== null && row.endToEnd.mean !== undefined)
      .slice()
      .sort((a, b) => a.endToEnd.mean - b.endToEnd.mean);
    const payloadBest = rows
      .filter((row) => row.payload.mean !== null && row.payload.mean !== undefined)
      .slice()
      .sort((a, b) => a.payload.mean - b.payload.mean)[0];
    const errorCount = rows.reduce((sum, row) => sum + (row.errors || 0), 0);
    return {
      size,
      fastest: successful[0] || null,
      payloadBest: payloadBest || null,
      errorCount
    };
  });

  const insights = [];
  if (overallRanked[0]) {
    insights.push({
      title: "Fastest Avg",
      value: overallRanked[0].label,
      detail: `${formatNumber(overallRanked[0].avg)} ms avg end-to-end`
    });
  }
  if (payloadWinner) {
    insights.push({
      title: "Smallest Payload",
      value: payloadWinner.label,
      detail: `${formatBytes(payloadWinner.avgPayload)} avg payload`
    });
  }
  if (mostWins) {
    const winnerId = mostWins[0];
    const winnerLabel = overallRanked.find((entry) => entry.formatId === winnerId)?.label || winnerId;
    insights.push({
      title: "Most Wins",
      value: winnerLabel,
      detail: `${mostWins[1]} of ${sizes.length} sizes`
    });
  }
  if (totalErrors > 0) {
    insights.push({
      title: "Errors",
      value: `${totalErrors}`,
      detail: errorList || "Investigate server logs for 5xx responses."
    });
  }

  const rankingsHtml = `
    <section class="card">
      <div class="section-title">
        <h2>Rankings by Size</h2>
        <span class="note">Top 3 by end-to-end mean</span>
      </div>
      <div class="rank-grid">
        ${sizeRankings
          .map((ranking) => {
            const rows = ranking.ranked;
            if (rows.length === 0) {
              return `
                <div class="rank-card">
                  <div class="rank-title">${ranking.size.toUpperCase()}</div>
                  <div class="rank-empty">No successful runs</div>
                </div>
              `;
            }
            return `
              <div class="rank-card">
                <div class="rank-title">${ranking.size.toUpperCase()}</div>
                <ol>
                  ${rows
                    .slice(0, 3)
                    .map((row, index) => {
                      const medal = index === 0 ? "gold" : index === 1 ? "silver" : "bronze";
                      return `<li><span class="medal ${medal}">#${index + 1}</span>${row.label}<span class="rank-metric">${formatNumber(row.endToEnd.mean)} ms</span></li>`;
                    })
                    .join("")}
                </ol>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="table-wrap">
        <h3>Overall Average (End-to-End Mean)</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Format</th>
              <th class="num">Avg End-to-End</th>
              <th class="num">Avg Payload</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            ${overallRanked
              .map((entry, index) => {
                const rowClass = index === 0 ? "row-top" : index < 3 ? "row-high" : "";
                const errorBadge = entry.errors
                  ? `<span class="badge badge-error">${entry.errors}</span>`
                  : `<span class="badge badge-ok">0</span>`;
                return `
                  <tr class="${rowClass}">
                    <td>${index + 1}</td>
                    <td>${entry.label}</td>
                    <td class="num">${formatNumber(entry.avg)} ms</td>
                    <td class="num">${formatBytes(entry.avgPayload)}</td>
                    <td>${errorBadge}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const insightsHtml = `
    <section class="card">
      <div class="section-title">
        <h2>At a Glance</h2>
        <span class="note">Key takeaways</span>
      </div>
      <div class="summary-grid">
        ${insights.length
          ? insights
            .map((item) => `
              <div class="summary-card">
                <div class="summary-label">${item.title}</div>
                <div class="summary-value">${item.value}</div>
                <div class="summary-detail">${item.detail}</div>
              </div>
            `)
            .join("")
          : "<div class=\"summary-empty\">No insights available.</div>"}
      </div>
    </section>
  `;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Benchmark Report</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500&display=swap");
    :root {
      color-scheme: light;
      --bg: #eef1f7;
      --card: #ffffff;
      --text: #111827;
      --muted: #5b6478;
      --accent: #0f3d7a;
      --accent-2: #ff8c42;
      --border: #e3e8f3;
      --shadow: 0 18px 45px rgba(16, 24, 40, 0.12);
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #f9fbff 0%, #eef1f7 45%, #e6eaf5 100%);
      color: var(--text);
    }
    .hero {
      background: linear-gradient(135deg, #0f3d7a 0%, #1a5aa0 55%, #5fa8d3 100%);
      color: #fff;
      padding: 48px 24px 96px;
      position: relative;
      overflow: hidden;
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.18), transparent 55%),
        radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.12), transparent 50%);
      pointer-events: none;
    }
    .hero-inner {
      max-width: 1120px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      gap: 20px 40px;
      align-items: flex-end;
      position: relative;
      z-index: 1;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 12px;
      opacity: 0.8;
      margin: 0 0 8px;
    }
    h1 {
      margin: 0 0 8px;
      font-family: "Newsreader", "Space Grotesk", serif;
      font-size: clamp(32px, 3.2vw, 44px);
    }
    .subtitle {
      margin: 0;
      opacity: 0.9;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }
    .pill-ok {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.4);
      color: #0f3d1f;
    }
    .pill-warn {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.4);
      color: #7f1d1d;
    }
    main {
      max-width: 1120px;
      margin: -64px auto 72px;
      padding: 0 24px 48px;
      display: grid;
      gap: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 22px;
      box-shadow: var(--shadow);
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .section-title h2 {
      margin: 0;
      font-size: 20px;
    }
    .note {
      font-size: 13px;
      color: var(--muted);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .summary-card {
      background: #f7f8fd;
      border-radius: 16px;
      padding: 16px;
      border: 1px solid #edf0f9;
    }
    .summary-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
    }
    .summary-value {
      font-size: 20px;
      font-weight: 600;
      margin: 6px 0 4px;
    }
    .summary-detail {
      font-size: 13px;
      color: var(--muted);
    }
    .summary-empty {
      color: var(--muted);
      font-size: 14px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .info-card {
      background: #f6f8fc;
      border-radius: 14px;
      padding: 14px;
      border: 1px solid var(--border);
    }
    .info-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .info-value {
      font-size: 14px;
      word-break: break-word;
    }
    .rank-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .rank-card {
      background: #f9fafc;
      border-radius: 16px;
      padding: 16px;
      border: 1px solid var(--border);
    }
    .rank-title {
      font-weight: 600;
      letter-spacing: 0.08em;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .rank-card ol {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 10px;
    }
    .rank-card li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .medal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 24px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: #e7edf9;
      color: #1e3a8a;
    }
    .medal.gold { background: #ffedd5; color: #9a3412; }
    .medal.silver { background: #e5e7eb; color: #334155; }
    .medal.bronze { background: #fee2e2; color: #7f1d1d; }
    .rank-metric {
      color: var(--muted);
      font-size: 12px;
    }
    .table-wrap {
      margin-top: 18px;
    }
    .data-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
    }
    .data-table th,
    .data-table td {
      padding: 12px 10px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .data-table th {
      background: #f2f5fb;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .data-table tbody tr:nth-child(odd) {
      background: #f9fbff;
    }
    .data-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .row-top {
      background: #e8f0ff;
    }
    .row-high {
      background: #f1f5ff;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-ok {
      background: #dcfce7;
      color: #166534;
    }
    .badge-error {
      background: #fee2e2;
      color: #b91c1c;
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 12px;
    }
    .chart-card {
      background: #f8fafc;
      border-radius: 16px;
      padding: 12px 12px 4px;
      border: 1px solid var(--border);
    }
    .chart-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .size-topline {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }
    details {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      margin-top: 16px;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div>
        <p class="eyebrow">Benchmark Report</p>
        <h1>Binary Transfer Benchmarks</h1>
        <p class="subtitle">Generated at ${timestamp}</p>
      </div>
      <div class="hero-meta">
        <span class="pill">Iterations: ${reportData.iterations}</span>
        <span class="pill">Sizes: ${sizes.join(", ")}</span>
        <span class="pill">Runs: ${reportData.runs.length}</span>
      </div>
    </div>
  </header>
  <main>
    ${insightsHtml}
    ${rankingsHtml}
    <section class="card">
      <div class="section-title">
        <h2>Environment</h2>
        <span class="note">Runtime details</span>
      </div>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Server Base</div>
          <div class="info-value">${reportData.serverBase}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Client Base</div>
          <div class="info-value">${reportData.clientBase}</div>
        </div>
        <div class="info-card">
          <div class="info-label">User Agent</div>
          <div class="info-value">${reportData.userAgent}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Total Runs</div>
          <div class="info-value">${reportData.runs.length}</div>
        </div>
      </div>
    </section>
    ${sizes
      .map((size) => {
        const highlight = sizeHighlights.find((item) => item.size === size);
        const fastestLabel = highlight?.fastest
          ? `${highlight.fastest.label} (${formatNumber(highlight.fastest.endToEnd.mean)} ms)`
          : "No successful runs";
        const payloadLabel = highlight?.payloadBest
          ? `${highlight.payloadBest.label} (${formatBytes(highlight.payloadBest.payload.mean)})`
          : "-";
        const errorLabel = highlight?.errorCount ? `${highlight.errorCount} errors` : "No errors";
        const errorClass = highlight?.errorCount ? "pill-warn" : "pill-ok";
        return `
        <section class="card" id="section-${size}">
          <div class="section-title">
            <h2>${size.toUpperCase()} Dataset</h2>
            <span class="note">${reportData.iterations} runs</span>
          </div>
          <div class="size-topline">
            <span class="pill">Fastest: ${fastestLabel}</span>
            <span class="pill">Smallest payload: ${payloadLabel}</span>
            <span class="pill ${errorClass}">Errors: ${errorLabel}</span>
          </div>
          <div class="chart-grid">
            <div class="chart-card">
              <div class="chart-title">Latency breakdown (ms)</div>
              <canvas id="chart-times-${size}" height="220"></canvas>
            </div>
            <div class="chart-card">
              <div class="chart-title">Payload size (bytes)</div>
              <canvas id="chart-bytes-${size}" height="220"></canvas>
            </div>
          </div>
          <h3>Aggregated Metrics</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Format</th>
                <th class="num">End-to-End Mean</th>
                <th class="num">End-to-End P95</th>
                <th class="num">Parse Mean</th>
                <th class="num">Serialize Mean</th>
                <th class="num">Payload Mean</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.aggregates[size]
                .map((row) => {
                  const errorBadge = row.errors
                    ? `<span class=\"badge badge-error\">${row.errors}</span>`
                    : `<span class=\"badge badge-ok\">0</span>`;
                  const rowClass = row.errors ? "row-high" : "";
                  return `
                    <tr class="${rowClass}">
                      <td>${row.label}</td>
                      <td class="num">${formatNumber(row.endToEnd.mean)} ms</td>
                      <td class="num">${formatNumber(row.endToEnd.p95)} ms</td>
                      <td class="num">${formatNumber(row.parse.mean)} ms</td>
                      <td class="num">${formatNumber(row.serialize.mean)} ms</td>
                      <td class="num">${formatBytes(row.payload.mean)}</td>
                      <td>${errorBadge}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
          <details>
            <summary>Run Details</summary>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Iteration</th>
                  <th>Format</th>
                  <th class="num">End-to-End</th>
                  <th class="num">Parse</th>
                  <th class="num">Serialize</th>
                  <th class="num">Payload</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.details[size]
                  .map((row) => {
                    const statusBadge = row.status === "ok"
                      ? `<span class=\"badge badge-ok\">ok</span>`
                      : `<span class=\"badge badge-error\">error</span>`;
                    return `
                      <tr>
                        <td>${row.iteration}</td>
                        <td>${row.label}</td>
                        <td class="num">${formatNumber(row.endToEndMs)} ms</td>
                        <td class="num">${formatNumber(row.parseMs)} ms</td>
                        <td class="num">${formatNumber(row.serverSerializeMs)} ms</td>
                        <td class="num">${formatBytes(row.payloadBytes)}</td>
                        <td>${statusBadge}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </details>
        </section>
      `;
      })
      .join("")}
  </main>
  <script>
    const reportData = ${JSON.stringify(reportData)};

    function chartTimes(size, canvasId) {
      const rows = reportData.aggregates[size];
      if (!rows || rows.length === 0) {
        return;
      }
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        return;
      }
      const labels = rows.map((row) => row.label);
      const endToEnd = rows.map((row) => row.endToEnd.mean || 0);
      const parse = rows.map((row) => row.parse.mean || 0);
      const serialize = rows.map((row) => row.serialize.mean || 0);

      new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "End-to-End (ms)",
              data: endToEnd,
              backgroundColor: "rgba(15, 61, 122, 0.8)"
            },
            {
              label: "Parse (ms)",
              data: parse,
              backgroundColor: "rgba(255, 140, 66, 0.75)"
            },
            {
              label: "Serialize (ms)",
              data: serialize,
              backgroundColor: "rgba(96, 165, 250, 0.75)"
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    function chartBytes(size, canvasId) {
      const rows = reportData.aggregates[size];
      if (!rows || rows.length === 0) {
        return;
      }
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        return;
      }
      const labels = rows.map((row) => row.label);
      const payload = rows.map((row) => row.payload.mean || 0);
      const serverPayload = rows.map((row) => row.serverPayload.mean || 0);

      new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Payload (bytes)",
              data: payload,
              backgroundColor: "rgba(16, 185, 129, 0.75)"
            },
            {
              label: "Server Payload (bytes)",
              data: serverPayload,
              backgroundColor: "rgba(148, 163, 184, 0.75)"
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

    for (const size of reportData.sizes) {
      chartTimes(size, "chart-times-" + size);
      chartBytes(size, "chart-bytes-" + size);
    }
  </script>
</body>
</html>`;

  return html;
}

async function main() {
  const serverArgs = [
    "-f",
    "server/pom.xml",
    "-DskipTests",
    "compile",
    "exec:java",
    "-Dexec.mainClass=com.benchmark.server.EmbeddedTomcat",
    "-Dexec.jvmArgs=--add-opens=java.base/java.nio=ALL-UNNAMED",
    "-Dexec.fork=true",
    "-Dserver.webapp=server/src/main/webapp",
    "-Dserver.classes=server/target/classes",
    "-Dserver.port=8090"
  ];

  const clientArgs = [
    "--prefix",
    "client",
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    "5173"
  ];

  console.log("Starting server...");
  spawnProcess("mvn", serverArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      JAVA_TOOL_OPTIONS: "--add-opens=java.base/java.nio=ALL-UNNAMED"
    }
  });

  const serverReady = await waitForHttp(`${SERVER_BASE}/api/health`, { timeoutMs: 120000 });
  if (!serverReady) {
    throw new Error("Server did not become ready.");
  }

  console.log("Starting client dev server...");
  spawnProcess("npm", clientArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      VITE_SERVER_BASE: SERVER_BASE
    }
  });

  const clientReady = await waitForHttp(CLIENT_BASE, { timeoutMs: 120000 });
  if (!clientReady) {
    throw new Error("Client dev server did not become ready.");
  }

  console.log("Launching Playwright...");
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error("[browser] page error:", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("[browser] console error:", message.text());
    }
  });
  await page.goto(CLIENT_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root > *", { timeout: 120000 });
  const runButton = page.getByRole("button", { name: /run benchmarks/i });
  const sizeSelect = page.getByLabel("Dataset size");
  await runButton.waitFor({ timeout: 120000 });

  const runs = [];
  for (const size of SIZE_PRESETS) {
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      console.log(`Running ${size.id} iteration ${iteration}...`);
      await page.evaluate(() => {
        window.__benchResults = null;
      });

      await sizeSelect.click();
      await page.getByRole("option", { name: size.label }).click();

      await runButton.click();
      await page.waitForFunction(
        (expectedSize) =>
          window.__benchResults &&
          window.__benchResults.status === "done" &&
          window.__benchResults.sizePreset === expectedSize,
        size.id,
        { timeout: TIMEOUT_MS }
      );

      const result = await page.evaluate(() => window.__benchResults);
      runs.push({
        sizePreset: result.sizePreset,
        iteration,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        results: result.results
      });
    }
  }

  const userAgent = await page.evaluate(() => navigator.userAgent);
  await browser.close();

  const aggregates = buildAggregates(runs);
  const aggregateRows = {};
  const detailsRows = {};
  for (const size of Object.keys(aggregates)) {
    aggregateRows[size] = [];
    detailsRows[size] = [];
    for (const [formatId, bucket] of Object.entries(aggregates[size])) {
      aggregateRows[size].push({
        formatId,
        label: FORMAT_LABELS[formatId] || formatId,
        endToEnd: computeStats(bucket.endToEndMs),
        parse: computeStats(bucket.parseMs),
        serialize: computeStats(bucket.serverSerializeMs),
        payload: computeStats(bucket.payloadBytes),
        serverPayload: computeStats(bucket.serverPayloadBytes),
        errors: bucket.errors
      });
    }
    aggregateRows[size].sort((a, b) => {
      const aIndex = FORMAT_ORDER.indexOf(a.formatId);
      const bIndex = FORMAT_ORDER.indexOf(b.formatId);
      if (aIndex === -1 && bIndex === -1) {
        return a.formatId.localeCompare(b.formatId);
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }
      return aIndex - bIndex;
    });
    for (const run of runs.filter((entry) => entry.sizePreset === size)) {
      for (const row of run.results) {
        const serverNanos = toNumber(row.serverSerializeNanos);
        detailsRows[size].push({
          iteration: run.iteration,
          formatId: row.formatId,
          label: FORMAT_LABELS[row.formatId] || row.formatId,
          status: row.status,
          endToEndMs: toNumber(row.endToEndMs),
          parseMs: toNumber(row.parseMs),
          serverSerializeMs: serverNanos === null ? null : serverNanos / 1e6,
          payloadBytes: toNumber(row.payloadBytes),
          serverPayloadBytes: toNumber(row.serverPayloadBytes)
        });
      }
    }
  }

  const reportData = {
    generatedAt: Date.now(),
    iterations: ITERATIONS,
    sizes: SIZE_PRESETS.map((size) => size.id),
    serverBase: SERVER_BASE,
    clientBase: CLIENT_BASE,
    userAgent,
    runs,
    aggregates: aggregateRows,
    details: detailsRows
  };

  const reportHtml = createReportHtml(reportData);
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, reportHtml, "utf8");

  console.log(`Report written to ${REPORT_PATH}`);

  await shutdown();
}

main().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exit(1);
});
