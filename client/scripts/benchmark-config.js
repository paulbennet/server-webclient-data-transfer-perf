/**
 * Benchmark Configuration
 *
 * Defines scoring weights, metric metadata, and thresholds for the benchmark report.
 * Customize these values to adjust how winners are determined.
 */

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

/**
 * Category weights for overall scoring.
 * Must sum to 1.0
 */
export const CATEGORY_WEIGHTS = {
  speed: 0.35,       // End-to-end latency, TTFB, parse time
  efficiency: 0.25,  // Payload size, compression, bytes per record
  stability: 0.20,   // Variance, p99/mean ratio, consistency
  resources: 0.20    // Memory usage, GC impact, CPU time
};

/**
 * Sub-weights within each category.
 * Each category's sub-weights must sum to 1.0
 */
export const SUB_WEIGHTS = {
  speed: {
    endToEndMs: 0.50,
    ttfbMs: 0.15,
    parseMs: 0.20,
    downloadMs: 0.10,
    serverSerializeMs: 0.05
  },
  efficiency: {
    payloadBytes: 0.50,
    bytesPerRecord: 0.30,
    transferSize: 0.20
  },
  stability: {
    endToEndVariance: 0.40,
    p99ToMeanRatio: 0.30,
    longTaskImpact: 0.30
  },
  resources: {
    serverHeapDelta: 0.30,
    clientHeapDelta: 0.25,
    serverGcTime: 0.20,
    serverCpuTime: 0.25
  }
};

// =============================================================================
// METRIC METADATA
// =============================================================================

/**
 * Metadata for all tracked metrics.
 * Used for display labels, units, and determining scoring direction.
 */
export const METRICS = {
  // Timing metrics
  endToEndMs: {
    label: "End-to-End",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "Total time from request start to parsed data ready"
  },
  parseMs: {
    label: "Parse Time",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "Client-side deserialization time"
  },
  serverSerializeMs: {
    label: "Server Serialize",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "Server-side serialization time"
  },
  ttfbMs: {
    label: "TTFB",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "Time to First Byte - server processing + network latency"
  },
  downloadMs: {
    label: "Download Time",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "Time to transfer response body"
  },
  dnsMs: {
    label: "DNS Lookup",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "DNS resolution time"
  },
  connectMs: {
    label: "Connect Time",
    unit: "ms",
    lowerIsBetter: true,
    category: "speed",
    description: "TCP/TLS connection time"
  },

  // Size metrics
  payloadBytes: {
    label: "Payload Size",
    unit: "bytes",
    lowerIsBetter: true,
    category: "efficiency",
    description: "Uncompressed response size"
  },
  serverPayloadBytes: {
    label: "Server Payload",
    unit: "bytes",
    lowerIsBetter: true,
    category: "efficiency",
    description: "Payload size as sent by server"
  },
  transferSize: {
    label: "Transfer Size",
    unit: "bytes",
    lowerIsBetter: true,
    category: "efficiency",
    description: "Actual bytes transferred (may include compression)"
  },
  bytesPerRecord: {
    label: "Bytes/Record",
    unit: "bytes",
    lowerIsBetter: true,
    category: "efficiency",
    description: "Payload efficiency - bytes per calendar event"
  },

  // Server memory metrics
  serverHeapUsedBefore: {
    label: "Server Heap (Before)",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "JVM heap usage before serialization"
  },
  serverHeapUsedAfter: {
    label: "Server Heap (After)",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "JVM heap usage after serialization"
  },
  serverHeapDelta: {
    label: "Server Heap Delta",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "Memory allocated during serialization"
  },
  serverGcCount: {
    label: "Server GC Count",
    unit: "count",
    lowerIsBetter: true,
    category: "resources",
    description: "Number of GC cycles during serialization"
  },
  serverGcTimeMs: {
    label: "Server GC Time",
    unit: "ms",
    lowerIsBetter: true,
    category: "resources",
    description: "Total GC pause time during serialization"
  },
  serverCpuTimeNanos: {
    label: "Server CPU Time",
    unit: "ns",
    lowerIsBetter: true,
    category: "resources",
    description: "CPU time consumed for serialization"
  },

  // Client memory metrics
  clientHeapBefore: {
    label: "Client Heap (Before)",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "JS heap usage before parsing (Chrome only)"
  },
  clientHeapAfter: {
    label: "Client Heap (After)",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "JS heap usage after parsing (Chrome only)"
  },
  clientHeapDelta: {
    label: "Client Heap Delta",
    unit: "bytes",
    lowerIsBetter: true,
    category: "resources",
    description: "Memory allocated during parsing (Chrome only)"
  },

  // Stability metrics
  longTaskCount: {
    label: "Long Tasks",
    unit: "count",
    lowerIsBetter: true,
    category: "stability",
    description: "Number of long tasks (>50ms) during parsing"
  },
  longTaskTotalMs: {
    label: "Long Task Time",
    unit: "ms",
    lowerIsBetter: true,
    category: "stability",
    description: "Total duration of long tasks during parsing"
  },
  eventCount: {
    label: "Event Count",
    unit: "count",
    lowerIsBetter: false,
    category: "info",
    description: "Number of calendar events in the response"
  }
};

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * Thresholds for visual indicators (good/warning/bad)
 * Values are relative to the best performer in each category
 */
export const THRESHOLDS = {
  // Within X% of best is "good"
  good: 1.1,    // Within 10% of best
  // Within X% of best is "acceptable"
  acceptable: 1.5,  // Within 50% of best
  // Above this is "poor"
  poor: 2.0     // More than 2x the best
};

// =============================================================================
// DISPLAY CONFIGURATION
// =============================================================================

export const FORMAT_LABELS = {
  orgjson: "org.json",
  jacksonstream: "Jackson Streaming",
  flexbuffers: "FlexBuffers",
  flatbuffers: "FlatBuffers",
  messagepack: "MessagePack",
  cbor: "CBOR",
  arrow: "Apache Arrow"
};

export const FORMAT_ORDER = Object.keys(FORMAT_LABELS);

export const SIZE_PRESETS = [
  { id: "small", label: "Small (1k)", count: 1000 },
  { id: "medium", label: "Medium (10k)", count: 10000 },
  { id: "large", label: "Large (50k)", count: 50000 }
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the scoring direction for a metric
 * @param {string} metricId - The metric identifier
 * @returns {number} -1 if lower is better, 1 if higher is better
 */
export function getScoringDirection(metricId) {
  const meta = METRICS[metricId];
  if (!meta) return -1; // Default: lower is better
  return meta.lowerIsBetter ? -1 : 1;
}

/**
 * Get the category for a metric
 * @param {string} metricId - The metric identifier
 * @returns {string} Category name or "other"
 */
export function getMetricCategory(metricId) {
  const meta = METRICS[metricId];
  return meta?.category || "other";
}

/**
 * Format a metric value for display
 * @param {number} value - The raw value
 * @param {string} metricId - The metric identifier
 * @returns {string} Formatted string with unit
 */
export function formatMetricValue(value, metricId) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  const meta = METRICS[metricId];
  if (!meta) {
    return String(value);
  }

  const unit = meta.unit;

  if (unit === "bytes") {
    return formatBytes(value);
  }

  if (unit === "ms") {
    return `${value.toFixed(2)} ms`;
  }

  if (unit === "ns") {
    // Convert to ms for display
    return `${(value / 1e6).toFixed(2)} ms`;
  }

  if (unit === "count") {
    return Math.round(value).toString();
  }

  return `${value.toFixed(2)} ${unit}`;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Byte count
 * @returns {string} Formatted string (e.g., "1.23 MB")
 */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return "-";
  }
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
