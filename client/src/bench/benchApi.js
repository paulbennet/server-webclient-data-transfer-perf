import { decode as decodeMsgpack } from "@msgpack/msgpack";
import { decode as decodeCbor } from "cbor-x";
import { tableFromIPC } from "apache-arrow";
import { toReference } from "flatbuffers/mjs/flexbuffers.js";
import * as flatbuffers from "flatbuffers";
import { CalendarEventList } from "../flatbuffers/CalendarEventList.js";

const DEFAULT_BASE = "http://localhost:8090";

export async function runBenchmark(formatId, sizePreset) {
  const base = import.meta.env.VITE_SERVER_BASE || DEFAULT_BASE;
  const url = `${base}/api/bench?format=${formatId}&size=${sizePreset}`;

  const startTotal = performance.now();
  const response = await fetch(url);
  const payload = await response.arrayBuffer();
  let endTotal = performance.now();

  if (!response.ok) {
    return {
      formatId,
      status: "error",
      statusCode: response.status,
      message: new TextDecoder().decode(payload),
      endToEndMs: endTotal - startTotal,
      payloadBytes: payload.byteLength,
      parseMs: null
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

  if (parseError) {
    return {
      formatId,
      status: "error",
      statusCode: response.status,
      message: parseError,
      endToEndMs: endTotal - startTotal,
      payloadBytes: payload.byteLength,
      parseMs,
      serverSerializeNanos: response.headers.get("X-Serialize-Nanos"),
      serverPayloadBytes: response.headers.get("X-Payload-Bytes")
    };
  }

  return {
    formatId,
    status: "ok",
    statusCode: response.status,
    endToEndMs: endTotal - startTotal,
    payloadBytes: payload.byteLength,
    parseMs,
    serverSerializeNanos: response.headers.get("X-Serialize-Nanos"),
    serverPayloadBytes: response.headers.get("X-Payload-Bytes")
  };
}
