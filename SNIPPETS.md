# Serialization Format Snippets

Concise code snippets showing server-side serialization (Java) and client-side deserialization (JavaScript) for each of the 7 supported formats.

---

## 1. org.json (`orgjson`)

**Content-Type:** `application/json; charset=utf-8`

### Server (Java)

```java
import org.json.JSONArray;
import org.json.JSONObject;

// Serialize events to JSON using DOM-style API
JSONArray array = new JSONArray();
for (CalendarEvent event : events) {
    JSONObject obj = new JSONObject();
    obj.put("id", event.getId());
    obj.put("title", event.getTitle());
    obj.put("location", event.getLocation());
    obj.put("tags", new JSONArray(event.getTags()));
    // ... other fields
    array.put(obj);
}
return array.toString().getBytes(StandardCharsets.UTF_8);
```

### Client (JavaScript)

```javascript
// Parse JSON using native browser API
const jsonText = new TextDecoder().decode(payload);
const events = JSON.parse(jsonText);
```

> **Note:** Simple and readable, but builds entire DOM in memory before serializing.

---

## 2. Jackson Streaming (`jacksonstream`)

**Content-Type:** `application/json; charset=utf-8`

### Server (Java)

```java
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;

private static final JsonFactory JSON_FACTORY = new JsonFactory();

// Serialize events using streaming API (no intermediate DOM)
ByteArrayOutputStream output = new ByteArrayOutputStream();
JsonGenerator gen = JSON_FACTORY.createGenerator(output);
gen.writeStartArray();
for (CalendarEvent event : events) {
    gen.writeStartObject();
    gen.writeNumberField("id", event.getId());
    gen.writeStringField("title", event.getTitle());
    gen.writeArrayFieldStart("tags");
    for (String tag : event.getTags()) gen.writeString(tag);
    gen.writeEndArray();
    // ... other fields
    gen.writeEndObject();
}
gen.writeEndArray();
gen.close();
return output.toByteArray();
```

### Client (JavaScript)

```javascript
// Same as orgjson - produces identical JSON output
const jsonText = new TextDecoder().decode(payload);
const events = JSON.parse(jsonText);
```

> **Note:** More memory-efficient than DOM; streams directly to output buffer.

---

## 3. FlexBuffers (`flexbuffers`)

**Content-Type:** `application/x-flexbuffers`

### Server (Java)

```java
import com.google.flatbuffers.FlexBuffers;
import com.google.flatbuffers.FlexBuffersBuilder;

// Serialize events to schema-less binary format
FlexBuffersBuilder builder = new FlexBuffersBuilder(1024);
int eventsVec = builder.startVector();
for (CalendarEvent event : events) {
    int map = builder.startMap();
    builder.putInt("id", event.getId());
    builder.putString("title", event.getTitle());
    // Arrays require nested vector
    int tagsVec = builder.startVector();
    for (String tag : event.getTags()) builder.putString(tag);
    builder.endVector("tags", tagsVec, false, false);
    // ... other fields
    builder.endMap(null, map);
}
builder.endVector(null, eventsVec, false, false);
ByteBuffer buffer = builder.finish();
return Arrays.copyOfRange(buffer.array(), buffer.position(), buffer.limit());
```

### Client (JavaScript)

```javascript
import { toReference } from "flatbuffers/mjs/flexbuffers.js";

// Parse FlexBuffers and convert to JS object
const ref = toReference(new Uint8Array(payload));
const events = ref.toObject();
```

> **Note:** Schema-less like JSON but binary. Supports zero-copy access.

---

## 4. FlatBuffers (`flatbuffers`)

**Content-Type:** `application/x-flatbuffers`

### Server (Java)

```java
import com.google.flatbuffers.FlatBufferBuilder;
import com.benchmark.server.flatbuffers.CalendarEvent;
import com.benchmark.server.flatbuffers.CalendarEventList;

// Serialize using schema-based binary format (requires .fbs schema)
FlatBufferBuilder builder = new FlatBufferBuilder(1024);
int[] eventOffsets = new int[events.size()];

for (int i = 0; i < events.size(); i++) {
    CalendarEvent event = events.get(i);
    int titleOffset = builder.createString(event.getTitle());
    int tagsOffset = CalendarEvent.createTagsVector(builder, tagOffsets);
    // ... create other string/vector offsets

    eventOffsets[i] = CalendarEvent.createCalendarEvent(builder,
        event.getId(), titleOffset, locationOffset, /* ... */);
}

int eventsVector = CalendarEventList.createEventsVector(builder, eventOffsets);
int root = CalendarEventList.createCalendarEventList(builder, eventsVector);
CalendarEventList.finishCalendarEventListBuffer(builder, root);
return builder.sizedByteArray();
```

### Client (JavaScript)

```javascript
import * as flatbuffers from "flatbuffers";
import { CalendarEventList } from "./flatbuffers/CalendarEventList.js";

// Parse using generated accessor classes
const bb = new flatbuffers.ByteBuffer(new Uint8Array(payload));
const list = CalendarEventList.getRootAsCalendarEventList(bb);

const events = [];
for (let i = 0; i < list.eventsLength(); i++) {
  const ev = list.events(i);
  events.push({
    id: ev.id(),
    title: ev.title(),
    tags: Array.from({ length: ev.tagsLength() }, (_, j) => ev.tags(j)),
  });
}
```

> **Note:** Zero-copy access, schema required. Best for stable schemas with high performance needs.

---

## 5. MessagePack (`messagepack`)

**Content-Type:** `application/x-msgpack`

### Server (Java)

```java
import org.msgpack.core.MessagePack;
import org.msgpack.core.MessagePacker;

// Serialize to compact binary format (like JSON but binary)
ByteArrayOutputStream output = new ByteArrayOutputStream();
MessagePacker packer = MessagePack.newDefaultPacker(output);
packer.packArrayHeader(events.size());

for (CalendarEvent event : events) {
    packer.packMapHeader(15); // number of fields
    packer.packString("id");
    packer.packLong(event.getId());
    packer.packString("title");
    packer.packString(event.getTitle());
    packer.packString("tags");
    packer.packArrayHeader(event.getTags().length);
    for (String tag : event.getTags()) packer.packString(tag);
    // ... other fields
}
packer.close();
return output.toByteArray();
```

### Client (JavaScript)

```javascript
import { decode } from "@msgpack/msgpack";

// Decode MessagePack to JS objects
const events = decode(new Uint8Array(payload));
```

> **Note:** Drop-in JSON replacement with ~30% smaller payloads. No schema required.

---

## 6. CBOR (`cbor`)

**Content-Type:** `application/cbor`

### Server (Java)

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.cbor.CBORFactory;

private static final ObjectMapper MAPPER = new ObjectMapper(new CBORFactory());

// Serialize using Jackson with CBOR format (reflection-based)
return MAPPER.writeValueAsBytes(events);
```

### Client (JavaScript)

```javascript
import { decode } from "cbor-x";

// Decode CBOR to JS objects
const events = decode(new Uint8Array(payload));
```

> **Note:** Simplest server code (uses Jackson reflection). IETF standard (RFC 8949).

---

## 7. Apache Arrow (`arrow`)

**Content-Type:** `application/vnd.apache.arrow.stream`

### Server (Java)

```java
import org.apache.arrow.memory.BufferAllocator;
import org.apache.arrow.memory.RootAllocator;
import org.apache.arrow.vector.*;
import org.apache.arrow.vector.ipc.ArrowStreamWriter;

// Serialize to columnar format (data stored by column, not row)
BufferAllocator allocator = new RootAllocator();
BigIntVector idVector = new BigIntVector("id", allocator);
VarCharVector titleVector = new VarCharVector("title", allocator);
// ... create other vectors

idVector.allocateNew(events.size());
titleVector.allocateNew(events.size());

for (int i = 0; i < events.size(); i++) {
    CalendarEvent event = events.get(i);
    idVector.setSafe(i, event.getId());
    titleVector.setSafe(i, event.getTitle().getBytes(StandardCharsets.UTF_8));
    // ... set other vectors
}

idVector.setValueCount(events.size());
titleVector.setValueCount(events.size());

VectorSchemaRoot root = VectorSchemaRoot.of(idVector, titleVector, /* ... */);
ByteArrayOutputStream output = new ByteArrayOutputStream();
ArrowStreamWriter writer = new ArrowStreamWriter(root, null, output);
writer.start();
writer.writeBatch();
writer.end();
writer.close();
return output.toByteArray();
```

### Client (JavaScript)

```javascript
import { tableFromIPC } from "apache-arrow";

// Parse Arrow IPC stream to columnar Table
const table = tableFromIPC(new Uint8Array(payload));

// Access by column (efficient for analytics)
const ids = table.getChild("id");
const titles = table.getChild("title");

// Or iterate rows
for (const row of table) {
  console.log(row.id, row.title);
}
```

> **Note:** Columnar format optimized for analytics. Zero-copy. Requires JVM arg: `--add-opens=java.base/java.nio=ALL-UNNAMED`

---

## Summary Comparison

| Format        | Schema | Zero-Copy | Server Complexity | Client Parse | Best For               |
| ------------- | ------ | --------- | ----------------- | ------------ | ---------------------- |
| orgjson       | No     | No        | Low               | Native       | Debugging, simple APIs |
| jacksonstream | No     | No        | Medium            | Native       | Large JSON payloads    |
| flexbuffers   | No     | Yes       | Medium            | Simple       | Dynamic schemas        |
| flatbuffers   | Yes    | Yes       | High              | Generated    | Max performance        |
| messagepack   | No     | No        | Medium            | Simple       | JSON replacement       |
| cbor          | No     | No        | Low               | Simple       | Standards compliance   |
| arrow         | Yes    | Yes       | High              | Simple       | Analytics, columnar    |
