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

  const suggestions = [];
  if (overallRanked[0]) {
    suggestions.push(`Overall fastest average end-to-end: <strong>${overallRanked[0].label}</strong> (${formatNumber(overallRanked[0].avg)} ms).`);
  }
  if (mostWins) {
    const winnerId = mostWins[0];
    const winnerLabel = overallRanked.find((entry) => entry.formatId === winnerId)?.label || winnerId;
    suggestions.push(`Most size wins: <strong>${winnerLabel}</strong> (${mostWins[1]} of ${sizes.length} sizes).`);
  }
  if (payloadWinner) {
    suggestions.push(`Smallest payload on average: <strong>${payloadWinner.label}</strong> (${formatInt(payloadWinner.avgPayload)} bytes).`);
  }
  if (errorFormats.length > 0) {
    const errorList = errorFormats.map((entry) => entry.label).join(", ");
    suggestions.push(`Errors detected for: <strong>${errorList}</strong>. Investigate server logs for 5xx responses.`);
  }

  const rankingsHtml = `
    <section class="card">
      <div class="section-title"><h2>Rankings</h2></div>
      <div class="meta-grid">
        ${sizeRankings
          .map((ranking) => {
            const rows = ranking.ranked;
            if (rows.length === 0) {
              return `
                <div class="meta-item">
                  <span>${ranking.size.toUpperCase()} Rankings</span>
                  <div>No successful runs</div>
                </div>
              `;
            }
            return `
              <div class="meta-item">
                <span>${ranking.size.toUpperCase()} Rankings</span>
                <ol>
                  ${rows
                    .slice(0, 3)
                    .map((row) => `<li>${row.label} (${formatNumber(row.endToEnd.mean)} ms)</li>`)
                    .join("")}
                </ol>
              </div>
            `;
          })
          .join("")}
      </div>
      <h3>Overall Average (End-to-End Mean)</h3>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Format</th>
            <th>Avg End-to-End (ms)</th>
            <th>Avg Payload (bytes)</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          ${overallRanked
            .map((entry, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${entry.label}</td>
                <td>${formatNumber(entry.avg)}</td>
                <td>${formatInt(entry.avgPayload)}</td>
                <td>${entry.errors}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </section>
  `;

  const suggestionsHtml = `
    <section class="card">
      <div class="section-title"><h2>Suggestions</h2></div>
      <ul>
        ${suggestions.length ? suggestions.map((item) => `<li>${item}</li>`).join("") : "<li>No suggestions available.</li>"}
      </ul>
    </section>
  `;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Benchmark Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #1f2a44;
      --muted: #5b6b85;
      --accent: #0a4d8c;
      --accent-2: #f2a154;
      --border: #e5e9f2;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      padding: 32px 24px 16px;
      background: linear-gradient(120deg, #0a4d8c 0%, #5fa8d3 100%);
      color: #fff;
    }
    header h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    header p {
      margin: 4px 0;
      opacity: 0.9;
    }
    main {
      padding: 24px;
      display: grid;
      gap: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .section-title h2 {
      margin: 0;
      font-size: 20px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .meta-item {
      background: #f7f9fc;
      border-radius: 12px;
      padding: 12px 14px;
      border: 1px solid var(--border);
    }
    .meta-item span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 4px;
    }
    .meta-item ol {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
      font-size: 13px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #f2f5fb;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
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
    .note {
      font-size: 13px;
      color: var(--muted);
    }
    ul {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
      line-height: 1.6;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
</head>
<body>
  <header>
    <h1>Binary Transfer Benchmark Report</h1>
    <p>Generated at ${timestamp}</p>
    <p>Iterations: ${reportData.iterations} | Sizes: ${sizes.join(", ")}</p>
  </header>
  <main>
    <section class="card">
      <div class="section-title"><h2>Environment</h2></div>
      <div class="meta-grid">
        <div class="meta-item"><span>Server Base</span>${reportData.serverBase}</div>
        <div class="meta-item"><span>Client Base</span>${reportData.clientBase}</div>
        <div class="meta-item"><span>User Agent</span>${reportData.userAgent}</div>
        <div class="meta-item"><span>Total Runs</span>${reportData.runs.length}</div>
      </div>
    </section>
    ${rankingsHtml}
    ${suggestionsHtml}
    ${sizes
      .map((size) => {
        return `
        <section class="card" id="section-${size}">
          <div class="section-title">
            <h2>${size.toUpperCase()} Dataset</h2>
            <span class="note">${reportData.iterations} runs</span>
          </div>
          <div class="chart-grid">
            <canvas id="chart-times-${size}" height="220"></canvas>
            <canvas id="chart-bytes-${size}" height="220"></canvas>
          </div>
          <h3>Aggregated Metrics</h3>
          <table>
            <thead>
              <tr>
                <th>Format</th>
                <th>End-to-End Mean (ms)</th>
                <th>End-to-End P95 (ms)</th>
                <th>Parse Mean (ms)</th>
                <th>Serialize Mean (ms)</th>
                <th>Payload Mean (bytes)</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.aggregates[size]
                .map((row) => {
                  return `
                    <tr>
                      <td>${row.label}</td>
                      <td>${formatNumber(row.endToEnd.mean)}</td>
                      <td>${formatNumber(row.endToEnd.p95)}</td>
                      <td>${formatNumber(row.parse.mean)}</td>
                      <td>${formatNumber(row.serialize.mean)}</td>
                      <td>${formatInt(row.payload.mean)}</td>
                      <td>${row.errors}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
          <details>
            <summary>Run Details</summary>
            <table>
              <thead>
                <tr>
                  <th>Iteration</th>
                  <th>Format</th>
                  <th>End-to-End (ms)</th>
                  <th>Parse (ms)</th>
                  <th>Serialize (ms)</th>
                  <th>Payload (bytes)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.details[size]
                  .map((row) => {
                    return `
                      <tr>
                        <td>${row.iteration}</td>
                        <td>${row.label}</td>
                        <td>${formatNumber(row.endToEndMs)}</td>
                        <td>${formatNumber(row.parseMs)}</td>
                        <td>${formatNumber(row.serverSerializeMs)}</td>
                        <td>${formatInt(row.payloadBytes)}</td>
                        <td>${row.status}</td>
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
              backgroundColor: "rgba(10, 77, 140, 0.75)"
            },
            {
              label: "Parse (ms)",
              data: parse,
              backgroundColor: "rgba(242, 161, 84, 0.7)"
            },
            {
              label: "Serialize (ms)",
              data: serialize,
              backgroundColor: "rgba(59, 130, 246, 0.65)"
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
              backgroundColor: "rgba(16, 185, 129, 0.7)"
            },
            {
              label: "Server Payload (bytes)",
              data: serverPayload,
              backgroundColor: "rgba(148, 163, 184, 0.7)"
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
