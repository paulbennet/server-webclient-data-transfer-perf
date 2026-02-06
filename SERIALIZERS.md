# Serializer Summaries

This document gives a short, practical summary of each serializer used in this project: how it works, the structure encoding it uses, and where it tends to be most useful.

## org.json

- How it works: Builds an in-memory JSON object model (DOM-style) and serializes it to UTF-8 text.
- Structure encoding: Textual JSON with nested objects/arrays and string keys.
- Best use cases: Debugging, small payloads, and environments where readability is more important than raw speed.
- Example data structure:
  ```json
  {
    "id": 1,
    "title": "Team Sync",
    "startTime": 1700000000000,
    "tags": ["work", "weekly"]
  }
  ```
- Encoding method: Builds a JSONObject/JSONArray tree, then emits JSON text with UTF-8 encoding.

## Jackson Streaming (JSON)

- How it works: Streams JSON tokens directly to the output without building a full in-memory DOM.
- Structure encoding: Textual JSON token stream (objects, arrays, field names, values).
- Best use cases: Large JSON payloads where lower memory usage and faster write throughput are needed.
- Example data structure:
  ```json
  {
    "id": 1,
    "title": "Team Sync",
    "startTime": 1700000000000,
    "tags": ["work", "weekly"]
  }
  ```
- Encoding method: Writes start/end object tokens and field/value tokens directly to an output stream.

## FlexBuffers

- How it works: Serializes schemaless data into a compact binary format with a self-describing layout.
- Structure encoding: Binary tree-like structure with type tags and offset tables; supports maps and vectors.
- Best use cases: Dynamic schemas where you still want relatively fast reads and compact binary size.
- Example data structure:
  ```text
  map {
  	"id": 1,
  	"title": "Team Sync",
  	"startTime": 1700000000000,
  	"tags": ["work", "weekly"]
  }
  ```
- Encoding method: Writes values in a buffer, then builds a root map with type tags and offsets.

## FlatBuffers

- How it works: Uses a schema to write a binary buffer that can be read without parsing or unpacking.
- Structure encoding: Binary tables with vtables, offsets, and optional fields; zero-copy access.
- Best use cases: Performance-critical, stable schemas with high read volumes and low allocation needs.
- Example data structure:
  ```text
  table CalendarEvent {
  	id: long = 1,
  	title: string = "Team Sync",
  	startTime: long = 1700000000000,
  	tags: ["work", "weekly"]
  }
  ```
- Encoding method: Uses a schema to build a table with a vtable, writing field offsets and data blocks.

## MessagePack

- How it works: Serializes JSON-like data into a compact binary representation with type prefixes.
- Structure encoding: Binary map/array structure with typed values and small header lengths.
- Best use cases: Drop-in replacement for JSON when you want smaller payloads and faster parse time.
- Example data structure:
  ```text
  map {
  	"id": 1,
  	"title": "Team Sync",
  	"startTime": 1700000000000,
  	"tags": ["work", "weekly"]
  }
  ```
- Encoding method: Writes a map header, then key/value pairs with type codes (int, str, array, etc).

## CBOR

- How it works: Encodes JSON-like data plus additional types into a compact binary format.
- Structure encoding: Binary typed items with major types, lengths, and tagged values.
- Best use cases: IoT or constrained environments that need a richer type system than JSON.
- Example data structure:
  ```text
  map {
  	"id": 1,
  	"title": "Team Sync",
  	"startTime": 1700000000000,
  	"tags": ["work", "weekly"]
  }
  ```
- Encoding method: Writes major type headers (map, array, text, int) with compact length encoding.

## Apache Arrow

- How it works: Serializes columnar data in a standardized, cache-friendly binary layout.
- Structure encoding: Columnar vectors with buffers for values, offsets, and validity bitmaps.
- Best use cases: Analytics and batch processing where columnar access and zero-copy sharing matter.
- Example data structure:
  ```text
  columns:
  	id:       [1, 2]
  	title:    ["Team Sync", "1:1"]
  	startTime:[1700000000000, 1700003600000]
  	tags:     [["work"], ["work", "weekly"]]
  ```
- Encoding method: Writes column buffers (values, offsets, validity) plus schema and record batch metadata.
