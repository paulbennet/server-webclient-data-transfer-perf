import { decode as decodeMsgpack } from "@msgpack/msgpack";
import { decode as decodeCbor } from "cbor-x";
import { tableFromIPC } from "apache-arrow";
import { toReference } from "flatbuffers/mjs/flexbuffers.js";
import * as flatbuffers from "flatbuffers";
import { CalendarEventList } from "../flatbuffers/CalendarEventList.js";

const DEFAULT_BASE = "http://localhost:8090";

/**
 * Get client-side heap memory usage (Chrome only)
 * @returns {number|null} Used JS heap size in bytes, or null if not supported
 */
function getJsHeapUsed() {
  if (typeof performance !== "undefined" && performance.memory) {
    return performance.memory.usedJSHeapSize;
  }
  return null;
}

/**
 * Extract Resource Timing metrics for a URL
 * @param {string} url The URL to find timing for
 * @returns {object} Timing metrics or nulls if not available
 */
function getResourceTiming(url) {
  const entries = performance.getEntriesByType("resource");
  // Find the most recent entry for this URL
  const entry = entries.filter((e) => e.name === url).pop();

  if (!entry) {
    return {
      ttfbMs: null,
      downloadMs: null,
      dnsMs: null,
      connectMs: null,
      transferSize: null
    };
  }

  return {
    ttfbMs: entry.responseStart > 0 ? entry.responseStart - entry.requestStart : null,
    downloadMs: entry.responseEnd > 0 && entry.responseStart > 0
      ? entry.responseEnd - entry.responseStart : null,
    dnsMs: entry.domainLookupEnd > 0 && entry.domainLookupStart > 0
      ? entry.domainLookupEnd - entry.domainLookupStart : null,
    connectMs: entry.connectEnd > 0 && entry.connectStart > 0
      ? entry.connectEnd - entry.connectStart : null,
    transferSize: entry.transferSize > 0 ? entry.transferSize : null
  };
}

/**
 * Setup Long Task observer
 * @returns {object} Object with getLongTasks() method to retrieve results
 */
function createLongTaskObserver() {
  const longTasks = [];
  let observer = null;

  if (typeof PerformanceObserver !== "undefined") {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime
          });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (e) {
      // longtask not supported
    }
  }

  return {
    disconnect: () => observer?.disconnect(),
    getLongTasks: () => ({
      count: longTasks.length,
      totalMs: longTasks.reduce((sum, t) => sum + t.duration, 0)
    })
  };
}

export async function runBenchmark(formatId, sizePreset) {
  const base = import.meta.env.VITE_SERVER_BASE || DEFAULT_BASE;
  const url = `${base}/api/bench?format=${formatId}&size=${sizePreset}`;

  // Setup long task observer before fetch
  const longTaskObserver = createLongTaskObserver();

  // Capture client heap before
  const clientHeapBefore = getJsHeapUsed();

  const startTotal = performance.now();
  const response = await fetch(url);
  const payload = await response.arrayBuffer();
  let endTotal = performance.now();

  if (!response.ok) {
    longTaskObserver.disconnect();
    const longTasks = longTaskObserver.getLongTasks();
    const resourceTiming = getResourceTiming(url);

    return {
      formatId,
      status: "error",
      statusCode: response.status,
      message: new TextDecoder().decode(payload),
      endToEndMs: endTotal - startTotal,
      payloadBytes: payload.byteLength,
      parseMs: null,
      // Server metrics
      serverSerializeNanos: response.headers.get("X-Serialize-Nanos"),
      serverPayloadBytes: response.headers.get("X-Payload-Bytes"),
      // Resource timing
      ...resourceTiming,
      // Client memory (partial)
      clientHeapBefore,
      clientHeapAfter: null,
      clientHeapDelta: null,
      // Long tasks
      longTaskCount: longTasks.count,
      longTaskTotalMs: longTasks.totalMs
    };
  }

  const parseStart = performance.now();
  let parsed = null;
  let parseError = null;
  try {
    if (formatId === "messagepack") {
      parsed = decodeMsgpack(new Uint8Array(payload));
    } else if (formatId === "cbor") {
      parsed = decodeCbor(new Uint8Array(payload));
    } else if (formatId === "flexbuffers") {
      const originalGetBigUint64 = DataView.prototype.getBigUint64;
      const originalGetBigInt64 = DataView.prototype.getBigInt64;
      if (originalGetBigUint64) {
        DataView.prototype.getBigUint64 = function (offset, littleEndian) {
          return Number(originalGetBigUint64.call(this, offset, littleEndian));
        };
      }
      if (originalGetBigInt64) {
        DataView.prototype.getBigInt64 = function (offset, littleEndian) {
          return Number(originalGetBigInt64.call(this, offset, littleEndian));
        };
      }
      try {
        const ref = toReference(payload);
        parsed = ref.toObject();
      } finally {
        if (originalGetBigUint64) {
          DataView.prototype.getBigUint64 = originalGetBigUint64;
        }
        if (originalGetBigInt64) {
          DataView.prototype.getBigInt64 = originalGetBigInt64;
        }
      }
    } else if (formatId === "flatbuffers") {
      const bb = new flatbuffers.ByteBuffer(new Uint8Array(payload));
      const list = CalendarEventList.getRootAsCalendarEventList(bb);
      const count = list.eventsLength();
      for (let i = 0; i < count; i += 1) {
        const event = list.events(i);
        if (event) {
          event.title();
          event.location();
          event.attendees();
          event.allDay();
          event.tagsLength();
          event.resourcesLength();
        }
      }
      parsed = { count };
    } else if (formatId === "arrow") {
      const table = tableFromIPC(new Uint8Array(payload));
      parsed = { count: table.numRows };
    } else if (formatId === "orgjson" || formatId === "jacksonstream") {
      const jsonText = new TextDecoder().decode(payload);
      parsed = JSON.parse(jsonText);
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const parseEnd = performance.now();
  endTotal = performance.now();

  const parseMs = parseEnd - parseStart;

  // Capture client heap after parsing
  const clientHeapAfter = getJsHeapUsed();
  const clientHeapDelta = clientHeapBefore !== null && clientHeapAfter !== null
    ? clientHeapAfter - clientHeapBefore
    : null;

  // Stop long task observer and get results
  longTaskObserver.disconnect();
  const longTasks = longTaskObserver.getLongTasks();

  // Get resource timing
  const resourceTiming = getResourceTiming(url);

  // Extract all server headers
  const serverMetrics = {
    serverSerializeNanos: response.headers.get("X-Serialize-Nanos"),
    serverPayloadBytes: response.headers.get("X-Payload-Bytes"),
    serverHeapUsedBefore: response.headers.get("X-Heap-Used-Before"),
    serverHeapUsedAfter: response.headers.get("X-Heap-Used-After"),
    serverHeapDelta: response.headers.get("X-Heap-Delta"),
    serverGcCount: response.headers.get("X-GC-Count"),
    serverGcTimeMs: response.headers.get("X-GC-Time-Ms"),
    serverCpuTimeNanos: response.headers.get("X-CPU-Time-Nanos"),
    eventCount: response.headers.get("X-Event-Count")
  };

  if (parseError) {
    return {
      formatId,
      status: "error",
      statusCode: response.status,
      message: parseError,
      endToEndMs: endTotal - startTotal,
      payloadBytes: payload.byteLength,
      parseMs,
      // Server metrics
      ...serverMetrics,
      // Resource timing
      ...resourceTiming,
      // Client memory
      clientHeapBefore,
      clientHeapAfter,
      clientHeapDelta,
      // Long tasks
      longTaskCount: longTasks.count,
      longTaskTotalMs: longTasks.totalMs
    };
  }

  return {
    formatId,
    status: "ok",
    statusCode: response.status,
    endToEndMs: endTotal - startTotal,
    payloadBytes: payload.byteLength,
    parseMs,
    // Server metrics
    ...serverMetrics,
    // Resource timing
    ...resourceTiming,
    // Client memory
    clientHeapBefore,
    clientHeapAfter,
    clientHeapDelta,
    // Long tasks
    longTaskCount: longTasks.count,
    longTaskTotalMs: longTasks.totalMs
  };
}
