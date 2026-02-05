import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  FORMAT_LABELS,
  FORMAT_ORDER,
  SIZE_PRESETS,
  CATEGORY_WEIGHTS,
  SUB_WEIGHTS,
  METRICS,
  formatBytes,
  getScoringDirection
} from "./benchmark-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const SERVER_BASE = process.env.BENCH_SERVER_BASE || "http://localhost:8090";
const CLIENT_BASE = process.env.BENCH_CLIENT_BASE || "http://localhost:5173";
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS || "5", 10);
const WARMUP_ITERATIONS = Number.parseInt(process.env.BENCH_WARMUP || "2", 10);
const TIMEOUT_MS = Number.parseInt(process.env.BENCH_TIMEOUT_MS || "600000", 10);
const HEADLESS = process.env.BENCH_HEADLESS === "true";
const REPORT_PATH = process.env.BENCH_REPORT_PATH || path.join(repoRoot, "client", "reports", "benchmark-report.html");

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
    return { mean: null, median: null, p95: null, p99: null, stddev: null, variance: null, min: null, max: null, count: 0 };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const p95Index = Math.floor(0.95 * (sorted.length - 1));
  const p95 = sorted[p95Index];
  const p99Index = Math.floor(0.99 * (sorted.length - 1));
  const p99 = sorted[p99Index];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate variance and standard deviation
  const squaredDiffs = sorted.map((value) => Math.pow(value - mean, 2));
  const variance = squaredDiffs.reduce((acc, value) => acc + value, 0) / sorted.length;
  const stddev = Math.sqrt(variance);

  return { mean, median, p95, p99, stddev, variance, min, max, count: sorted.length };
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
          // Timing metrics
          endToEndMs: [],
          parseMs: [],
          serverSerializeMs: [],
          ttfbMs: [],
          downloadMs: [],
          dnsMs: [],
          connectMs: [],
          // Size metrics
          payloadBytes: [],
          serverPayloadBytes: [],
          transferSize: [],
          bytesPerRecord: [],
          // Server memory metrics
          serverHeapUsedBefore: [],
          serverHeapUsedAfter: [],
          serverHeapDelta: [],
          serverGcCount: [],
          serverGcTimeMs: [],
          serverCpuTimeNanos: [],
          // Client memory metrics
          clientHeapBefore: [],
          clientHeapAfter: [],
          clientHeapDelta: [],
          // Stability metrics
          longTaskCount: [],
          longTaskTotalMs: [],
          // Meta
          eventCount: [],
          errors: 0
        };
      }
      const bucket = aggregates[size][formatId];
      if (result.status !== "ok") {
        bucket.errors += 1;
        continue;
      }

      // Timing metrics
      bucket.endToEndMs.push(toNumber(result.endToEndMs));
      bucket.parseMs.push(toNumber(result.parseMs));
      const serverNanos = toNumber(result.serverSerializeNanos);
      bucket.serverSerializeMs.push(serverNanos === null ? null : serverNanos / 1e6);
      bucket.ttfbMs.push(toNumber(result.ttfbMs));
      bucket.downloadMs.push(toNumber(result.downloadMs));
      bucket.dnsMs.push(toNumber(result.dnsMs));
      bucket.connectMs.push(toNumber(result.connectMs));

      // Size metrics
      bucket.payloadBytes.push(toNumber(result.payloadBytes));
      bucket.serverPayloadBytes.push(toNumber(result.serverPayloadBytes));
      bucket.transferSize.push(toNumber(result.transferSize));

      // Calculate bytes per record
      const eventCount = toNumber(result.eventCount);
      const payloadSize = toNumber(result.payloadBytes);
      if (eventCount && payloadSize) {
        bucket.bytesPerRecord.push(payloadSize / eventCount);
      }
      bucket.eventCount.push(eventCount);

      // Server memory metrics
      bucket.serverHeapUsedBefore.push(toNumber(result.serverHeapUsedBefore));
      bucket.serverHeapUsedAfter.push(toNumber(result.serverHeapUsedAfter));
      bucket.serverHeapDelta.push(toNumber(result.serverHeapDelta));
      bucket.serverGcCount.push(toNumber(result.serverGcCount));
      bucket.serverGcTimeMs.push(toNumber(result.serverGcTimeMs));
      bucket.serverCpuTimeNanos.push(toNumber(result.serverCpuTimeNanos));

      // Client memory metrics
      bucket.clientHeapBefore.push(toNumber(result.clientHeapBefore));
      bucket.clientHeapAfter.push(toNumber(result.clientHeapAfter));
      bucket.clientHeapDelta.push(toNumber(result.clientHeapDelta));

      // Stability metrics
      bucket.longTaskCount.push(toNumber(result.longTaskCount));
      bucket.longTaskTotalMs.push(toNumber(result.longTaskTotalMs));
    }
  }
  return aggregates;
}

// =============================================================================
// SCORING SYSTEM
// =============================================================================

/**
 * Calculate normalized score for a metric value (0-1, higher is better)
 * @param {number} value - The value to score
 * @param {number[]} allValues - All values for this metric across formats
 * @param {boolean} lowerIsBetter - Whether lower values are better
 * @returns {number} Normalized score 0-1
 */
function normalizeScore(value, allValues, lowerIsBetter = true) {
  const validValues = allValues.filter((v) => v !== null && Number.isFinite(v));
  if (validValues.length === 0 || value === null || !Number.isFinite(value)) {
    return null;
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);

  if (min === max) {
    return 1; // All equal = all perfect
  }

  if (lowerIsBetter) {
    // Invert so lower = higher score
    return (max - value) / (max - min);
  }

  return (value - min) / (max - min);
}

/**
 * Calculate category scores for a format based on weighted sub-metrics
 * @param {object} formatStats - Statistics for a single format
 * @param {object} allFormatsStats - Statistics for all formats (for comparison)
 * @returns {object} Category scores
 */
function calculateCategoryScores(formatStats, allFormatsStats) {
  const scores = {};

  // Speed category
  const speedMetrics = [
    { id: "endToEndMs", key: "endToEnd" },
    { id: "ttfbMs", key: "ttfb" },
    { id: "parseMs", key: "parse" },
    { id: "downloadMs", key: "download" },
    { id: "serverSerializeMs", key: "serialize" }
  ];

  let speedScore = 0;
  let speedWeightSum = 0;
  for (const { id, key } of speedMetrics) {
    const weight = SUB_WEIGHTS.speed[id] || 0;
    if (weight === 0) continue;

    const value = formatStats[key]?.mean;
    const allValues = allFormatsStats.map((f) => f[key]?.mean);
    const score = normalizeScore(value, allValues, true);

    if (score !== null) {
      speedScore += score * weight;
      speedWeightSum += weight;
    }
  }
  scores.speed = speedWeightSum > 0 ? speedScore / speedWeightSum : null;

  // Efficiency category
  const efficiencyMetrics = [
    { id: "payloadBytes", key: "payload" },
    { id: "bytesPerRecord", key: "bytesPerRecord" },
    { id: "transferSize", key: "transfer" }
  ];

  let efficiencyScore = 0;
  let efficiencyWeightSum = 0;
  for (const { id, key } of efficiencyMetrics) {
    const weight = SUB_WEIGHTS.efficiency[id] || 0;
    if (weight === 0) continue;

    const value = formatStats[key]?.mean;
    const allValues = allFormatsStats.map((f) => f[key]?.mean);
    const score = normalizeScore(value, allValues, true);

    if (score !== null) {
      efficiencyScore += score * weight;
      efficiencyWeightSum += weight;
    }
  }
  scores.efficiency = efficiencyWeightSum > 0 ? efficiencyScore / efficiencyWeightSum : null;

  // Stability category
  const endToEndVariance = formatStats.endToEnd?.variance;
  const endToEndMean = formatStats.endToEnd?.mean;
  const p99 = formatStats.endToEnd?.p99;
  const p99ToMeanRatio = endToEndMean > 0 && p99 > 0 ? p99 / endToEndMean : null;
  const longTaskImpact = formatStats.longTaskTotal?.mean || 0;

  let stabilityScore = 0;
  let stabilityWeightSum = 0;

  // Variance score
  if (endToEndVariance !== null) {
    const allVariances = allFormatsStats.map((f) => f.endToEnd?.variance);
    const varianceScore = normalizeScore(endToEndVariance, allVariances, true);
    if (varianceScore !== null) {
      stabilityScore += varianceScore * SUB_WEIGHTS.stability.endToEndVariance;
      stabilityWeightSum += SUB_WEIGHTS.stability.endToEndVariance;
    }
  }

  // P99/mean ratio score
  if (p99ToMeanRatio !== null) {
    const allRatios = allFormatsStats.map((f) => {
      const mean = f.endToEnd?.mean;
      const p99Val = f.endToEnd?.p99;
      return mean > 0 && p99Val > 0 ? p99Val / mean : null;
    });
    const ratioScore = normalizeScore(p99ToMeanRatio, allRatios, true);
    if (ratioScore !== null) {
      stabilityScore += ratioScore * SUB_WEIGHTS.stability.p99ToMeanRatio;
      stabilityWeightSum += SUB_WEIGHTS.stability.p99ToMeanRatio;
    }
  }

  // Long task impact score
  const allLongTaskImpacts = allFormatsStats.map((f) => f.longTaskTotal?.mean || 0);
  const longTaskScore = normalizeScore(longTaskImpact, allLongTaskImpacts, true);
  if (longTaskScore !== null) {
    stabilityScore += longTaskScore * SUB_WEIGHTS.stability.longTaskImpact;
    stabilityWeightSum += SUB_WEIGHTS.stability.longTaskImpact;
  }

  scores.stability = stabilityWeightSum > 0 ? stabilityScore / stabilityWeightSum : null;

  // Resources category
  const resourceMetrics = [
    { id: "serverHeapDelta", key: "serverHeapDelta" },
    { id: "clientHeapDelta", key: "clientHeapDelta" },
    { id: "serverGcTime", key: "serverGcTime" },
    { id: "serverCpuTime", key: "serverCpuTime" }
  ];

  let resourceScore = 0;
  let resourceWeightSum = 0;
  for (const { id, key } of resourceMetrics) {
    const weight = SUB_WEIGHTS.resources[id] || 0;
    if (weight === 0) continue;

    const value = formatStats[key]?.mean;
    const allValues = allFormatsStats.map((f) => f[key]?.mean);
    const score = normalizeScore(value, allValues, true);

    if (score !== null) {
      resourceScore += score * weight;
      resourceWeightSum += weight;
    }
  }
  scores.resources = resourceWeightSum > 0 ? resourceScore / resourceWeightSum : null;

  return scores;
}

/**
 * Calculate overall weighted score from category scores
 * @param {object} categoryScores - Scores for each category
 * @returns {number|null} Overall score 0-1
 */
function calculateOverallScore(categoryScores) {
  let totalScore = 0;
  let totalWeight = 0;

  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const score = categoryScores[category];
    if (score !== null && Number.isFinite(score)) {
      totalScore += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? totalScore / totalWeight : null;
}

/**
 * Calculate scores for all formats across all sizes
 * @param {object} aggregates - Aggregated stats per size per format
 * @returns {object} Scoring data including category scores, overall scores, and rankings
 */
function calculateScoring(aggregates) {
  const scoring = {
    bySize: {},
    overall: {},
    categoryWinners: {},
    overallWinner: null,
    weights: {
      categories: CATEGORY_WEIGHTS,
      subWeights: SUB_WEIGHTS
    }
  };

  // Calculate scores per size
  for (const [size, formats] of Object.entries(aggregates)) {
    const formatsList = Object.values(formats);
    scoring.bySize[size] = {};

    for (const format of formatsList) {
      const categoryScores = calculateCategoryScores(format, formatsList);
      const overallScore = calculateOverallScore(categoryScores);

      scoring.bySize[size][format.formatId] = {
        formatId: format.formatId,
        label: FORMAT_LABELS[format.formatId] || format.formatId,
        categoryScores,
        overallScore
      };
    }
  }

  // Calculate overall scores (average across sizes)
  const formatIds = new Set();
  for (const formats of Object.values(aggregates)) {
    for (const formatId of Object.keys(formats)) {
      formatIds.add(formatId);
    }
  }

  for (const formatId of formatIds) {
    const sizeScores = [];
    const categoryTotals = { speed: [], efficiency: [], stability: [], resources: [] };

    for (const size of Object.keys(scoring.bySize)) {
      const sizeData = scoring.bySize[size][formatId];
      if (sizeData && sizeData.overallScore != null) {
        sizeScores.push(sizeData.overallScore);
        for (const cat of Object.keys(categoryTotals)) {
          if (sizeData.categoryScores[cat] != null) {
            categoryTotals[cat].push(sizeData.categoryScores[cat]);
          }
        }
      }
    }

    const avgOverall = sizeScores.length > 0
      ? sizeScores.reduce((a, b) => a + b, 0) / sizeScores.length
      : null;

    const avgCategories = {};
    for (const [cat, scores] of Object.entries(categoryTotals)) {
      avgCategories[cat] = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;
    }

    scoring.overall[formatId] = {
      formatId,
      label: FORMAT_LABELS[formatId] || formatId,
      overallScore: avgOverall,
      categoryScores: avgCategories
    };
  }

  // Determine category winners
  for (const category of Object.keys(CATEGORY_WEIGHTS)) {
    let bestFormat = null;
    let bestScore = -Infinity;

    for (const [formatId, data] of Object.entries(scoring.overall)) {
      const score = data.categoryScores[category];
      if (score !== null && score > bestScore) {
        bestScore = score;
        bestFormat = formatId;
      }
    }

    scoring.categoryWinners[category] = bestFormat
      ? { formatId: bestFormat, label: FORMAT_LABELS[bestFormat], score: bestScore }
      : null;
  }

  // Determine overall winner
  let overallBest = null;
  let overallBestScore = -Infinity;

  for (const [formatId, data] of Object.entries(scoring.overall)) {
    if (data.overallScore !== null && data.overallScore > overallBestScore) {
      overallBestScore = data.overallScore;
      overallBest = formatId;
    }
  }

  scoring.overallWinner = overallBest
    ? { formatId: overallBest, label: FORMAT_LABELS[overallBest], score: overallBestScore }
    : null;

  return scoring;
}

/**
 * Detect anomalies in benchmark data
 * @param {object} aggregates - Aggregated results by size
 * @param {number} iterations - Number of iterations run
 * @returns {object} Anomaly report
 */
function detectAnomalies(aggregates, iterations) {
  const anomalies = {
    warnings: [],
    errors: [],
    dataQuality: "good"
  };

  // Check for insufficient sample size
  if (iterations < 3) {
    anomalies.warnings.push({
      type: "low_sample_size",
      message: `Only ${iterations} iteration(s) run. Statistical measures like stddev and p95 may be unreliable. Recommend 5+ iterations.`,
      severity: "warning"
    });
  }

  // Check for zero standard deviation (indicates single run or identical values)
  for (const [size, rows] of Object.entries(aggregates)) {
    for (const row of rows) {
      if (row.endToEnd.stddev === 0 && row.endToEnd.count > 1) {
        anomalies.warnings.push({
          type: "zero_variance",
          message: `${row.label} in ${size} has zero variance despite ${row.endToEnd.count} runs - data may be cached or stale.`,
          severity: "warning"
        });
      }
    }
  }

  // Check for negative heap deltas (GC interference)
  for (const [size, rows] of Object.entries(aggregates)) {
    for (const row of rows) {
      const serverHeapDelta = row.serverHeapDelta?.mean;
      if (serverHeapDelta !== null && serverHeapDelta < -1000000) { // -1MB threshold
        anomalies.warnings.push({
          type: "gc_interference",
          message: `${row.label} in ${size} shows significant negative heap delta (${formatBytes(serverHeapDelta)}) - GC likely ran during measurement.`,
          severity: "info"
        });
      }
    }
  }

  // Check for missing TTFB values
  let missingTtfbCount = 0;
  let totalTtfbChecks = 0;
  for (const [size, rows] of Object.entries(aggregates)) {
    for (const row of rows) {
      totalTtfbChecks++;
      if (row.ttfb?.mean === null || row.ttfb?.count === 0) {
        missingTtfbCount++;
      }
    }
  }
  if (missingTtfbCount > 0 && missingTtfbCount === totalTtfbChecks) {
    anomalies.warnings.push({
      type: "missing_ttfb",
      message: "All TTFB measurements are null. Resource Timing API may not be working. Check Timing-Allow-Origin header.",
      severity: "warning"
    });
  }

  // Check for inverted scaling (smaller datasets taking longer than larger ones)
  const sizeOrder = ["small", "medium", "large"];
  for (const row of aggregates[sizeOrder[0]] || []) {
    const formatId = row.formatId;
    const times = sizeOrder.map(size => {
      const sizeData = aggregates[size]?.find(r => r.formatId === formatId);
      return sizeData?.endToEnd?.mean;
    }).filter(t => t !== null && t !== undefined);

    if (times.length >= 2) {
      for (let i = 0; i < times.length - 1; i++) {
        if (times[i] > times[i + 1] * 1.5) { // Current is 50% slower than next larger size
          anomalies.warnings.push({
            type: "inverted_scaling",
            message: `${row.label}: ${sizeOrder[i]} (${formatNumber(times[i])}ms) is slower than ${sizeOrder[i + 1]} (${formatNumber(times[i + 1])}ms) - possible cold start or caching issue.`,
            severity: "warning"
          });
        }
      }
    }
  }

  // Check for extremely high coefficient of variation (>50%)
  for (const [size, rows] of Object.entries(aggregates)) {
    for (const row of rows) {
      const mean = row.endToEnd?.mean;
      const stddev = row.endToEnd?.stddev;
      if (mean && stddev && mean > 0) {
        const cv = (stddev / mean) * 100;
        if (cv > 50) {
          anomalies.warnings.push({
            type: "high_variance",
            message: `${row.label} in ${size} has ${cv.toFixed(1)}% coefficient of variation - results are highly inconsistent.`,
            severity: "warning"
          });
        }
      }
    }
  }

  // Set overall data quality
  if (anomalies.errors.length > 0) {
    anomalies.dataQuality = "poor";
  } else if (anomalies.warnings.length > 3) {
    anomalies.dataQuality = "fair";
  } else if (anomalies.warnings.length > 0) {
    anomalies.dataQuality = "acceptable";
  }

  return anomalies;
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

  // Build scoring-based insights
  const scoring = reportData.scoring || {};
  const insights = [];

  // Overall winner (from composite scoring)
  if (scoring.overallWinner) {
    insights.push({
      title: "Overall Winner",
      value: scoring.overallWinner.label,
      detail: `Score: ${(scoring.overallWinner.score * 100).toFixed(1)}% (weighted composite)`,
      highlight: true
    });
  }

  // Category winners
  const categoryLabels = {
    speed: "Fastest",
    efficiency: "Most Efficient",
    stability: "Most Stable",
    resources: "Lowest Resources"
  };

  for (const [category, label] of Object.entries(categoryLabels)) {
    const winner = scoring.categoryWinners?.[category];
    if (winner) {
      insights.push({
        title: label,
        value: winner.label,
        detail: `${category} score: ${(winner.score * 100).toFixed(1)}%`
      });
    }
  }

  // Legacy insights as fallback
  if (insights.length === 0) {
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
        <span class="note">Winner determined by weighted composite score across Speed (35%), Efficiency (25%), Stability (20%), Resources (20%)</span>
      </div>
      <div class="summary-grid">
        ${insights.length
          ? insights
            .map((item) => `
              <div class="summary-card${item.highlight ? " summary-card-highlight" : ""}">
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

  // Build anomalies/warnings section
  const anomalies = reportData.anomalies || [];
  const anomaliesHtml = anomalies.length > 0 ? `
    <section class="card anomalies-section">
      <div class="section-title">
        <h2>⚠️ Data Quality Warnings</h2>
        <span class="note">${anomalies.length} issue${anomalies.length > 1 ? 's' : ''} detected that may affect benchmark validity</span>
      </div>
      <div class="anomalies-list">
        ${anomalies.map(a => {
          const severityClass = a.severity === 'high' ? 'anomaly-high' : a.severity === 'medium' ? 'anomaly-medium' : 'anomaly-low';
          const severityIcon = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟠' : '🟡';
          return `
            <div class="anomaly-item ${severityClass}">
              <div class="anomaly-header">
                <span class="anomaly-icon">${severityIcon}</span>
                <span class="anomaly-type">${a.type.replace(/_/g, ' ').toUpperCase()}</span>
                <span class="anomaly-severity">${a.severity}</span>
              </div>
              <div class="anomaly-message">${a.message}</div>
              ${a.recommendation ? `<div class="anomaly-recommendation">💡 ${a.recommendation}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  ` : '';

  // Build scoring breakdown section
  const scoringHtml = scoring.overall ? `
    <section class="card">
      <div class="section-title">
        <h2>Scoring Breakdown</h2>
        <span class="note">Normalized scores (0-100%), higher is better</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Format</th>
            <th class="num">Speed</th>
            <th class="num">Efficiency</th>
            <th class="num">Stability</th>
            <th class="num">Resources</th>
            <th class="num">Overall</th>
          </tr>
        </thead>
        <tbody>
          ${Object.values(scoring.overall)
            .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
            .map((entry, index) => {
              const rowClass = index === 0 ? "row-top" : index < 3 ? "row-high" : "";
              const fmt = (v) => v !== null && Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "-";
              return `
                <tr class="${rowClass}">
                  <td>${entry.label}</td>
                  <td class="num">${fmt(entry.categoryScores?.speed)}</td>
                  <td class="num">${fmt(entry.categoryScores?.efficiency)}</td>
                  <td class="num">${fmt(entry.categoryScores?.stability)}</td>
                  <td class="num">${fmt(entry.categoryScores?.resources)}</td>
                  <td class="num"><strong>${fmt(entry.overallScore)}</strong></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
      <div class="chart-card" style="margin-top: 16px;">
        <div class="chart-title">Category Scores by Format</div>
        <canvas id="chart-radar-overall" height="300"></canvas>
      </div>
    </section>
  ` : "";
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
    /* Pills inside cards need dark text for visibility */
    .card .pill {
      background: rgba(15, 61, 122, 0.1);
      color: var(--accent);
      border-color: rgba(15, 61, 122, 0.25);
    }
    .card .pill-ok {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.4);
      color: #0f3d1f;
    }
    .card .pill-warn {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.4);
      color: #7f1d1d;
    }
    main {
      max-width: 1120px;
      margin: -32px auto 72px;
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
    .summary-card-highlight {
      background: linear-gradient(135deg, #e8f0ff 0%, #f0f4ff 100%);
      border: 2px solid var(--accent);
      box-shadow: 0 4px 12px rgba(15, 61, 122, 0.15);
    }
    .summary-card-highlight .summary-value {
      color: var(--accent);
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
    /* Anomalies/Warnings Section */
    .anomalies-section {
      border-left: 4px solid #f59e0b;
    }
    .anomalies-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .anomaly-item {
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .anomaly-high {
      background: #fef2f2;
      border-color: #fca5a5;
    }
    .anomaly-medium {
      background: #fffbeb;
      border-color: #fcd34d;
    }
    .anomaly-low {
      background: #fefce8;
      border-color: #fde047;
    }
    .anomaly-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .anomaly-icon {
      font-size: 14px;
    }
    .anomaly-type {
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.05em;
    }
    .anomaly-severity {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(0,0,0,0.06);
      text-transform: uppercase;
    }
    .anomaly-message {
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
    }
    .anomaly-recommendation {
      margin-top: 8px;
      font-size: 13px;
      color: var(--muted);
      font-style: italic;
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
    ${anomaliesHtml}
    ${scoringHtml}
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
                <th class="num">P95</th>
                <th class="num">StdDev</th>
                <th class="num">Parse</th>
                <th class="num">Serialize</th>
                <th class="num">TTFB</th>
                <th class="num">Payload</th>
                <th class="num">Server Heap Δ</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.aggregates[size]
                .map((row) => {
                  const errorBadge = row.errors
                    ? `<span class="badge badge-error">${row.errors}</span>`
                    : `<span class="badge badge-ok">0</span>`;
                  const rowClass = row.errors ? "row-high" : "";
                  return `
                    <tr class="${rowClass}">
                      <td>${row.label}</td>
                      <td class="num">${formatNumber(row.endToEnd.mean)} ms</td>
                      <td class="num">${formatNumber(row.endToEnd.p95)} ms</td>
                      <td class="num">${formatNumber(row.endToEnd.stddev)} ms</td>
                      <td class="num">${formatNumber(row.parse.mean)} ms</td>
                      <td class="num">${formatNumber(row.serialize.mean)} ms</td>
                      <td class="num">${formatNumber(row.ttfb?.mean)} ms</td>
                      <td class="num">${formatBytes(row.payload.mean)}</td>
                      <td class="num">${formatBytes(row.serverHeapDelta?.mean)}</td>
                      <td>${errorBadge}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
          <details>
            <summary>Memory &amp; Resource Metrics</summary>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th class="num">Server Heap Δ</th>
                  <th class="num">Server GC Count</th>
                  <th class="num">Server GC Time</th>
                  <th class="num">Server CPU</th>
                  <th class="num">Client Heap Δ</th>
                  <th class="num">Long Tasks</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.aggregates[size]
                  .map((row) => `
                    <tr>
                      <td>${row.label}</td>
                      <td class="num">${formatBytes(row.serverHeapDelta?.mean)}</td>
                      <td class="num">${formatNumber(row.serverGcCount?.mean, 1)}</td>
                      <td class="num">${formatNumber(row.serverGcTime?.mean)} ms</td>
                      <td class="num">${formatNumber(row.serverCpuTime?.mean ? row.serverCpuTime.mean / 1e6 : null)} ms</td>
                      <td class="num">${formatBytes(row.clientHeapDelta?.mean)}</td>
                      <td class="num">${formatNumber(row.longTaskCount?.mean, 1)} (${formatNumber(row.longTaskTotal?.mean)} ms)</td>
                    </tr>
                  `)
                  .join("")}
              </tbody>
            </table>
          </details>
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
                  <th class="num">TTFB</th>
                  <th class="num">Payload</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.details[size]
                  .map((row) => {
                    const statusBadge = row.status === "ok"
                      ? `<span class="badge badge-ok">ok</span>`
                      : `<span class="badge badge-error">error</span>`;
                    return `
                      <tr>
                        <td>${row.iteration}</td>
                        <td>${row.label}</td>
                        <td class="num">${formatNumber(row.endToEndMs)} ms</td>
                        <td class="num">${formatNumber(row.parseMs)} ms</td>
                        <td class="num">${formatNumber(row.serverSerializeMs)} ms</td>
                        <td class="num">${formatNumber(row.ttfbMs)} ms</td>
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

    // Radar chart for overall category scores
    function chartRadar() {
      const scoring = reportData.scoring;
      if (!scoring || !scoring.overall) return;

      const canvas = document.getElementById("chart-radar-overall");
      if (!canvas) return;

      const formats = Object.values(scoring.overall)
        .filter(f => f.overallScore !== null)
        .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

      const colors = [
        "rgba(15, 61, 122, 0.8)",
        "rgba(255, 140, 66, 0.8)",
        "rgba(16, 185, 129, 0.8)",
        "rgba(139, 92, 246, 0.8)",
        "rgba(239, 68, 68, 0.8)",
        "rgba(59, 130, 246, 0.8)",
        "rgba(245, 158, 11, 0.8)"
      ];

      const datasets = formats.map((format, index) => ({
        label: format.label,
        data: [
          (format.categoryScores?.speed || 0) * 100,
          (format.categoryScores?.efficiency || 0) * 100,
          (format.categoryScores?.stability || 0) * 100,
          (format.categoryScores?.resources || 0) * 100
        ],
        backgroundColor: colors[index % colors.length].replace("0.8", "0.2"),
        borderColor: colors[index % colors.length],
        borderWidth: 2,
        pointBackgroundColor: colors[index % colors.length]
      }));

      new Chart(canvas, {
        type: "radar",
        data: {
          labels: ["Speed", "Efficiency", "Stability", "Resources"],
          datasets
        },
        options: {
          responsive: true,
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: { stepSize: 20 }
            }
          },
          plugins: {
            legend: {
              position: "bottom"
            }
          }
        }
      });
    }

    chartRadar();

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

  // Warmup runs to stabilize JIT and system caches
  if (WARMUP_ITERATIONS > 0) {
    console.log(`\nRunning ${WARMUP_ITERATIONS} warmup iteration(s)...`);
    for (let warmup = 1; warmup <= WARMUP_ITERATIONS; warmup += 1) {
      for (const size of SIZE_PRESETS) {
        console.log(`  Warmup ${warmup}: ${size.id}...`);
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
        // Discard warmup results
      }
    }
    console.log("Warmup complete.\n");
  }

  const runs = [];
  for (const size of SIZE_PRESETS) {
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      console.log(`Running ${size.id} iteration ${iteration}/${ITERATIONS}...`);

      // Request GC on server before each measurement for more reliable memory metrics
      try {
        await fetch(`${SERVER_BASE}/api/gc`, { method: "POST" });
        await new Promise(r => setTimeout(r, 100)); // Let GC settle
      } catch (e) {
        // GC endpoint may not exist, continue anyway
      }

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
        // Timing metrics
        endToEnd: computeStats(bucket.endToEndMs),
        parse: computeStats(bucket.parseMs),
        serialize: computeStats(bucket.serverSerializeMs),
        ttfb: computeStats(bucket.ttfbMs),
        download: computeStats(bucket.downloadMs),
        dns: computeStats(bucket.dnsMs),
        connect: computeStats(bucket.connectMs),
        // Size metrics
        payload: computeStats(bucket.payloadBytes),
        serverPayload: computeStats(bucket.serverPayloadBytes),
        transfer: computeStats(bucket.transferSize),
        bytesPerRecord: computeStats(bucket.bytesPerRecord),
        // Server memory metrics
        serverHeapBefore: computeStats(bucket.serverHeapUsedBefore),
        serverHeapAfter: computeStats(bucket.serverHeapUsedAfter),
        serverHeapDelta: computeStats(bucket.serverHeapDelta),
        serverGcCount: computeStats(bucket.serverGcCount),
        serverGcTime: computeStats(bucket.serverGcTimeMs),
        serverCpuTime: computeStats(bucket.serverCpuTimeNanos),
        // Client memory metrics
        clientHeapBefore: computeStats(bucket.clientHeapBefore),
        clientHeapAfter: computeStats(bucket.clientHeapAfter),
        clientHeapDelta: computeStats(bucket.clientHeapDelta),
        // Stability metrics
        longTaskCount: computeStats(bucket.longTaskCount),
        longTaskTotal: computeStats(bucket.longTaskTotalMs),
        // Meta
        eventCount: computeStats(bucket.eventCount),
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
        const serverCpuNanos = toNumber(row.serverCpuTimeNanos);
        detailsRows[size].push({
          iteration: run.iteration,
          formatId: row.formatId,
          label: FORMAT_LABELS[row.formatId] || row.formatId,
          status: row.status,
          // Timing
          endToEndMs: toNumber(row.endToEndMs),
          parseMs: toNumber(row.parseMs),
          serverSerializeMs: serverNanos === null ? null : serverNanos / 1e6,
          ttfbMs: toNumber(row.ttfbMs),
          downloadMs: toNumber(row.downloadMs),
          // Size
          payloadBytes: toNumber(row.payloadBytes),
          serverPayloadBytes: toNumber(row.serverPayloadBytes),
          transferSize: toNumber(row.transferSize),
          // Server memory
          serverHeapDelta: toNumber(row.serverHeapDelta),
          serverGcCount: toNumber(row.serverGcCount),
          serverGcTimeMs: toNumber(row.serverGcTimeMs),
          serverCpuTimeMs: serverCpuNanos === null ? null : serverCpuNanos / 1e6,
          // Client memory
          clientHeapDelta: toNumber(row.clientHeapDelta),
          // Stability
          longTaskCount: toNumber(row.longTaskCount),
          longTaskTotalMs: toNumber(row.longTaskTotalMs),
          // Meta
          eventCount: toNumber(row.eventCount)
        });
      }
    }
  }

  // Convert aggregateRows (arrays) to object format for scoring calculation
  const aggregatesForScoring = {};
  for (const [size, rows] of Object.entries(aggregateRows)) {
    aggregatesForScoring[size] = {};
    for (const row of rows) {
      aggregatesForScoring[size][row.formatId] = row;
    }
  }

  // Calculate scoring based on all metrics
  const scoring = calculateScoring(aggregatesForScoring);

  // Detect anomalies in the data
  const anomalies = detectAnomalies(aggregateRows, ITERATIONS);

  const reportData = {
    generatedAt: Date.now(),
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    sizes: SIZE_PRESETS.map((size) => size.id),
    serverBase: SERVER_BASE,
    clientBase: CLIENT_BASE,
    userAgent,
    runs,
    aggregates: aggregateRows,
    details: detailsRows,
    scoring,
    anomalies
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
