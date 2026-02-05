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
  const endTotal = performance.now();

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
      const ref = toReference(new Uint8Array(payload));
      parsed = ref.toObject();
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

  const parseMs = parsed ? parseEnd - parseStart : null;

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
