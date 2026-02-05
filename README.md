# Server-to-Browser Serialization Benchmark

![Java](https://img.shields.io/badge/Java-17-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

A comprehensive benchmarking tool for comparing serialization formats in server-to-browser data transfer scenarios. Measures end-to-end performance including server-side serialization, network transfer, and client-side parsing across 7 different formats and multiple dataset sizes.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Server](#server)
- [Client](#client)
- [API Reference](#api-reference)
- [Serialization Formats](#serialization-formats)
- [Data Model](#data-model)
- [Benchmark Automation](#benchmark-automation)
- [Testing](#testing)
- [FlatBuffers Code Generation](#flatbuffers-code-generation)
- [Configuration Reference](#configuration-reference)
- [VS Code Tasks](#vs-code-tasks)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [License](#license)

---

## Overview

This project benchmarks the full round-trip cost of transferring event data from a Java backend to a browser-based UI using different serialization formats.

**Metrics captured:**

| Metric             | Description                             | Unit         |
| ------------------ | --------------------------------------- | ------------ |
| Serialization time | Time to serialize data on the server    | nanoseconds  |
| Payload size       | Size of the serialized response body    | bytes        |
| Parse time         | Time to deserialize data in the browser | milliseconds |
| Total latency      | End-to-end request/response time        | milliseconds |

**Dataset sizes:**

| Preset   | Event Count |
| -------- | ----------- |
| `small`  | 1,000       |
| `medium` | 10,000      |
| `large`  | 50,000      |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client (Browser)                           │
│  React 18 + Vite 5 + Material-UI 5                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐  │
│  │  UI (MUI)   │───▶│  benchApi   │───▶│  Format-specific parsers    │  │
│  │  App.jsx    │    │  fetch()    │    │  JSON, MsgPack, CBOR, etc.  │  │
│  └─────────────┘    └─────────────┘    └─────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTP (fetch)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Server (JVM)                               │
│  Java 17 + Embedded Tomcat 9 + Struts 2.5.33                            │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────────┐   │
│  │  Struts     │───▶│  BenchmarkAction │───▶│  SerializerRegistry   │   │
│  │  Filter     │    │  /api/bench      │    │  7 format serializers │   │
│  └─────────────┘    └──────────────────┘    └───────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│                     ┌──────────────────┐                                │
│                     │ EventDataGenerator│                               │
│                     │ (deterministic)   │                               │
│                     └──────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tech Stack:**

| Layer            | Technology      | Version |
| ---------------- | --------------- | ------- |
| Server runtime   | Embedded Tomcat | 9.0.89  |
| Server framework | Apache Struts 2 | 2.5.33  |
| Server language  | Java            | 17      |
| Client bundler   | Vite            | 5.0.12  |
| Client framework | React           | 18.2.0  |
| Client UI        | Material-UI     | 5.15.14 |
| Automation       | Playwright      | 1.58.1  |

---

## Prerequisites

| Tool     | Version | Notes                                        |
| -------- | ------- | -------------------------------------------- |
| Java JDK | 17+     | Required for server compilation and runtime  |
| Maven    | 3.8+    | Build tool for server                        |
| Node.js  | 18+     | Required for client and benchmark automation |
| npm      | 9+      | Package manager for client dependencies      |

Verify installation:

```bash
java -version   # Should show 17+
mvn -version    # Should show 3.8+
node -v         # Should show v18+
npm -v          # Should show 9+
```

---

## Quick Start

### 1. Start the server (port 8090)

```bash
mvn -f server/pom.xml -DskipTests compile exec:java \
  -Dexec.mainClass=com.benchmark.server.EmbeddedTomcat \
  -Dexec.jvmArgs="--add-opens=java.base/java.nio=ALL-UNNAMED" \
  -Dserver.webapp=server/src/main/webapp \
  -Dserver.classes=server/target/classes \
  -Dserver.port=8090
```

### 2. Start the client (port 5173)

```bash
npm --prefix client install
npm --prefix client run dev
```

### 3. Open the benchmark UI

- **Client UI:** http://localhost:5173
- **Health check:** http://localhost:8090/api/health
- **Example API call:** http://localhost:8090/api/bench?format=messagepack&size=small

---

## Server

The server is a Java application using embedded Tomcat with Struts 2 for request handling.

### Build

```bash
# Compile only
mvn -f server/pom.xml compile

# Package as WAR (for external Tomcat deployment)
mvn -f server/pom.xml -DskipTests package
# Output: server/target/server.war
```

### Run (Embedded Tomcat)

```bash
mvn -f server/pom.xml -DskipTests compile exec:java \
  -Dexec.mainClass=com.benchmark.server.EmbeddedTomcat \
  -Dexec.jvmArgs="--add-opens=java.base/java.nio=ALL-UNNAMED" \
  -Dserver.webapp=server/src/main/webapp \
  -Dserver.classes=server/target/classes \
  -Dserver.port=8090
```

### Run with Debug (port 5005)

```bash
mvn -f server/pom.xml -DskipTests compile exec:java \
  -Dexec.mainClass=com.benchmark.server.EmbeddedTomcat \
  -Dexec.jvmArgs="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005 --add-opens=java.base/java.nio=ALL-UNNAMED" \
  -Dserver.webapp=server/src/main/webapp \
  -Dserver.classes=server/target/classes \
  -Dserver.port=8090
```

### Server Dependencies

| Library       | Version  | Purpose                    |
| ------------- | -------- | -------------------------- |
| Struts 2 Core | 2.5.33   | Web framework              |
| Tomcat Embed  | 9.0.89   | Embedded servlet container |
| Jackson       | 2.17.0   | JSON streaming + CBOR      |
| org.json      | 20240303 | DOM-style JSON             |
| FlatBuffers   | 23.5.26  | Schema-based binary format |
| MessagePack   | 0.9.8    | Compact binary format      |
| Apache Arrow  | 15.0.1   | Columnar binary format     |
| Log4j 2       | 2.23.1   | Logging                    |

---

## Client

The client is a React single-page application built with Vite.

### Install dependencies

```bash
npm --prefix client install
```

### Development server

```bash
npm --prefix client run dev
# Opens at http://localhost:5173
```

### Production build

```bash
npm --prefix client run build
# Output: client/dist/
```

### Client Dependencies

| Package          | Version | Purpose              |
| ---------------- | ------- | -------------------- |
| React            | 18.2.0  | UI framework         |
| @mui/material    | 5.15.14 | Component library    |
| @msgpack/msgpack | 2.7.2   | MessagePack decoding |
| cbor-x           | 1.5.8   | CBOR decoding        |
| flatbuffers      | 24.3.25 | FlatBuffers decoding |
| apache-arrow     | 15.0.2  | Arrow IPC decoding   |

---

## API Reference

### Health Check

```
GET /api/health
```

**Response:** `200 OK` with body `ok`

### Garbage Collection

```
GET /api/gc
```

Triggers JVM garbage collection for benchmark isolation. Useful for consistent memory measurements between runs.

**Response:**

```json
{
  "status": "ok",
  "heapBefore": 52428800,
  "heapAfter": 31457280,
  "freed": 20971520
}
```

### Benchmark Endpoint

```
GET /api/bench?format={format}&size={size}
```

**Query Parameters:**

| Parameter | Required | Values                                                                                   | Description                  |
| --------- | -------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| `format`  | Yes      | `orgjson`, `jacksonstream`, `flexbuffers`, `flatbuffers`, `messagepack`, `cbor`, `arrow` | Serialization format         |
| `size`    | Yes      | `small`, `medium`, `large`, or integer                                                   | Number of events to generate |

**Response Headers:**

| Header               | Description                              | Example                 |
| -------------------- | ---------------------------------------- | ----------------------- |
| `X-Serialize-Nanos`  | Server serialization time in nanoseconds | `12345678`              |
| `X-Payload-Bytes`    | Response body size in bytes              | `524288`                |
| `X-Format`           | Format used for serialization            | `messagepack`           |
| `X-Heap-Used-Before` | JVM heap usage before serialization      | `52428800`              |
| `X-Heap-Used-After`  | JVM heap usage after serialization       | `53477376`              |
| `X-Heap-Delta`       | Memory allocated during serialization    | `1048576`               |
| `X-GC-Count`         | GC collections during serialization      | `0`                     |
| `X-GC-Time-Ms`       | Total GC pause time (milliseconds)       | `0`                     |
| `X-CPU-Time-Nanos`   | CPU time consumed (nanoseconds)          | `8765432`               |
| `X-Event-Count`      | Number of events in response             | `1000`                  |
| `Content-Type`       | MIME type of response                    | `application/x-msgpack` |

**Response Body:** Serialized event data in the requested format.

**Example:**

```bash
curl -i "http://localhost:8090/api/bench?format=cbor&size=small"
```

---

## Serialization Formats

| Format ID       | Content-Type                          | Type                | Library (Server) | Library (Client) |
| --------------- | ------------------------------------- | ------------------- | ---------------- | ---------------- |
| `orgjson`       | `application/json; charset=utf-8`     | Text/DOM            | org.json         | `JSON.parse()`   |
| `jacksonstream` | `application/json; charset=utf-8`     | Text/Streaming      | Jackson          | `JSON.parse()`   |
| `flexbuffers`   | `application/x-flexbuffers`           | Binary/Schema-less  | FlatBuffers      | flatbuffers.js   |
| `flatbuffers`   | `application/x-flatbuffers`           | Binary/Schema-based | FlatBuffers      | flatbuffers.js   |
| `messagepack`   | `application/x-msgpack`               | Binary/Map-based    | msgpack-java     | @msgpack/msgpack |
| `cbor`          | `application/cbor`                    | Binary/JSON-like    | Jackson CBOR     | cbor-x           |
| `arrow`         | `application/vnd.apache.arrow.stream` | Binary/Columnar     | Apache Arrow     | apache-arrow     |

### Format Characteristics

| Format            | Schema Required | Zero-Copy | Human Readable | Best For                             |
| ----------------- | --------------- | --------- | -------------- | ------------------------------------ |
| org.json          | No              | No        | Yes            | Debugging, simple APIs               |
| Jackson Streaming | No              | No        | Yes            | Large JSON payloads                  |
| FlexBuffers       | No              | Yes       | No             | Dynamic schemas                      |
| FlatBuffers       | Yes             | Yes       | No             | Performance-critical, stable schemas |
| MessagePack       | No              | No        | No             | Drop-in JSON replacement             |
| CBOR              | No              | No        | No             | IoT, constrained environments        |
| Arrow             | Yes             | Yes       | No             | Analytics, columnar data             |

---

## Data Model

The benchmark uses a `CalendarEvent` model with 15 fields:

| Field         | Type       | Description                      |
| ------------- | ---------- | -------------------------------- |
| `id`          | `long`     | Unique event identifier          |
| `title`       | `String`   | Event title                      |
| `location`    | `String`   | Event location                   |
| `organizer`   | `String`   | Event organizer email            |
| `startTime`   | `long`     | Start timestamp (epoch ms)       |
| `endTime`     | `long`     | End timestamp (epoch ms)         |
| `attendees`   | `int`      | Number of attendees              |
| `allDay`      | `boolean`  | All-day event flag               |
| `description` | `String`   | Event description                |
| `tags`        | `String[]` | Event tags/labels                |
| `resources`   | `String[]` | Booked resources                 |
| `createdAt`   | `long`     | Creation timestamp (epoch ms)    |
| `updatedAt`   | `long`     | Last update timestamp (epoch ms) |
| `priority`    | `int`      | Priority level (1-5)             |
| `timezone`    | `String`   | Timezone identifier              |

**Source:** [server/src/main/java/com/benchmark/server/model/CalendarEvent.java](server/src/main/java/com/benchmark/server/model/CalendarEvent.java)

---

## Benchmark Automation

The project includes a Playwright-based automation script that runs all format/size combinations and generates an HTML report.

### Install Playwright

```bash
npm --prefix client install
npx --prefix client playwright install
```

### Run automated benchmarks

```bash
npm --prefix client run benchmark:run
```

This will:

1. Start the server (embedded Tomcat)
2. Start the Vite dev server
3. Launch a browser via Playwright
4. Run all format × size combinations
5. Generate an HTML report with charts

### Environment Variables

| Variable            | Default                                | Description                          |
| ------------------- | -------------------------------------- | ------------------------------------ |
| `BENCH_ITERATIONS`  | `3`                                    | Number of iterations per format/size |
| `BENCH_SERVER_BASE` | `http://localhost:8090`                | Server base URL                      |
| `BENCH_CLIENT_BASE` | `http://localhost:5173`                | Client base URL                      |
| `BENCH_HEADLESS`    | `false`                                | Run browser in headless mode         |
| `BENCH_TIMEOUT_MS`  | `600000`                               | Total timeout in milliseconds        |
| `BENCH_REPORT_PATH` | `client/reports/benchmark-report.html` | Report output path                   |

**Example with custom settings:**

```bash
BENCH_ITERATIONS=5 BENCH_HEADLESS=true npm --prefix client run benchmark:run
```

### Scoring System

The benchmark uses a weighted scoring system defined in [client/scripts/benchmark-config.js](client/scripts/benchmark-config.js):

| Category   | Weight | Description                           |
| ---------- | ------ | ------------------------------------- |
| Speed      | 35%    | End-to-end latency, TTFB, parse time  |
| Efficiency | 25%    | Payload size, bytes per record        |
| Stability  | 20%    | Variance, P99/mean ratio, consistency |
| Resources  | 20%    | Memory usage, GC impact, CPU time     |

### Report Output

The HTML report is generated at [client/reports/benchmark-report.html](client/reports/benchmark-report.html) and includes:

- Rankings by dataset size (top 3 formats)
- Overall average comparison
- Latency breakdown charts (serialize, transfer, parse)
- Payload size comparison charts
- Memory and resource usage comparisons
- Per-format aggregated metrics (mean, P95)
- Expandable run details

---

## Testing

### Server Tests

The server includes JUnit 5 tests for all serializers:

```bash
mvn -f server/pom.xml test
```

**Test files:**

| Test                                                                                                                          | Coverage                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [ArrowSerializerTest](server/src/test/java/com/benchmark/server/serialization/ArrowSerializerTest.java)                       | Arrow round-trip             |
| [CborSerializerTest](server/src/test/java/com/benchmark/server/serialization/CborSerializerTest.java)                         | CBOR round-trip              |
| [FlatBuffersSerializerTest](server/src/test/java/com/benchmark/server/serialization/FlatBuffersSerializerTest.java)           | FlatBuffers round-trip       |
| [FlexBuffersSerializerTest](server/src/test/java/com/benchmark/server/serialization/FlexBuffersSerializerTest.java)           | FlexBuffers round-trip       |
| [JacksonStreamingSerializerTest](server/src/test/java/com/benchmark/server/serialization/JacksonStreamingSerializerTest.java) | Jackson streaming round-trip |
| [MessagePackSerializerTest](server/src/test/java/com/benchmark/server/serialization/MessagePackSerializerTest.java)           | MessagePack round-trip       |
| [OrgJsonSerializerTest](server/src/test/java/com/benchmark/server/serialization/OrgJsonSerializerTest.java)                   | org.json round-trip          |

> **Note:** Arrow tests require the JVM argument `--add-opens=java.base/java.nio=ALL-UNNAMED`. This is configured in the pom.xml surefire plugin.

---

## FlatBuffers Code Generation

If you modify the FlatBuffers schema, regenerate the code:

### Schema Location

[server/src/main/resources/flatbuffers/calendar_event.fbs](server/src/main/resources/flatbuffers/calendar_event.fbs)

### Generate Java code

```bash
flatc --java -o server/src/main/java \
  server/src/main/resources/flatbuffers/calendar_event.fbs
```

### Generate JavaScript code

```bash
flatc --ts -o client/src/flatbuffers \
  server/src/main/resources/flatbuffers/calendar_event.fbs
```

> **Note:** Install `flatc` via your package manager or download from the [FlatBuffers releases](https://github.com/google/flatbuffers/releases).

---

## Configuration Reference

### Server System Properties

| Property         | Default | Description                   |
| ---------------- | ------- | ----------------------------- |
| `server.port`    | `8080`  | HTTP port for embedded Tomcat |
| `server.webapp`  | —       | Path to webapp directory      |
| `server.classes` | —       | Path to compiled classes      |

### Client Environment Variables

| Variable           | Default                 | Description                   |
| ------------------ | ----------------------- | ----------------------------- |
| `VITE_SERVER_BASE` | `http://localhost:8090` | Server base URL for API calls |

---

## VS Code Tasks

The project includes pre-configured VS Code tasks in [.vscode/tasks.json](.vscode/tasks.json):

| Task             | Command                 | Description                    |
| ---------------- | ----------------------- | ------------------------------ |
| `server:package` | `mvn package`           | Build server WAR               |
| `server:test`    | `mvn test`              | Run server unit tests          |
| `server:run`     | `mvn exec:java`         | Run embedded Tomcat            |
| `server:debug`   | `mvn exec:java` (debug) | Run with debugger on port 5005 |
| `client:dev`     | `npm run dev`           | Start Vite dev server          |
| `client:build`   | `npm run build`         | Production build               |

**Run via Command Palette:** `Tasks: Run Task` → select task

---

## Troubleshooting

### Arrow "illegal reflective access" error

**Symptom:** `InaccessibleObjectException` when running Arrow serialization

**Solution:** Add JVM argument:

```
--add-opens=java.base/java.nio=ALL-UNNAMED
```

This is required because Arrow uses reflection to access internal NIO buffer APIs.

### CORS errors in browser

**Symptom:** `Access-Control-Allow-Origin` errors when client calls server

**Solution:** Ensure [CorsFilter](server/src/main/java/com/benchmark/server/filter/CorsFilter.java) is active. The filter is configured in [web.xml](server/src/main/webapp/WEB-INF/web.xml).

### Port 8090 already in use

**Symptom:** `Address already in use` when starting server

**Solution:**

```bash
# Find process using port 8090
lsof -i :8090
# Kill the process or use a different port
mvn ... -Dserver.port=8091
```

### Port 5173 already in use

**Symptom:** Vite fails to start

**Solution:**

```bash
# Find process using port 5173
lsof -i :5173
# Or let Vite pick another port (it will auto-increment)
```

### Server not responding

**Symptom:** Client shows network errors

**Checklist:**

1. Verify server is running: `curl http://localhost:8090/api/health`
2. Check `VITE_SERVER_BASE` matches server URL
3. Review server logs for exceptions

### Benchmark runner times out

**Symptom:** Playwright script fails with timeout

**Solution:** Increase timeout:

```bash
BENCH_TIMEOUT_MS=1200000 npm --prefix client run benchmark:run
```

---

## Project Structure

```
.
├── README.md                     # This file
├── .github/
│   └── copilot-instructions.md   # GitHub Copilot instructions
├── .vscode/
│   └── tasks.json                # VS Code task definitions
├── client/                       # React client application
│   ├── package.json              # Client dependencies
│   ├── vite.config.js            # Vite configuration
│   ├── index.html                # Entry HTML
│   ├── src/
│   │   ├── App.jsx               # Main React component
│   │   ├── main.jsx              # React entry point
│   │   └── bench/
│   │       ├── benchApi.js       # API client & parsers
│   │       └── formats.js        # Format definitions
│   ├── scripts/
│   │   ├── benchmark-runner.js   # Playwright automation
│   │   └── benchmark-config.js   # Scoring weights & metrics
│   └── reports/
│       └── benchmark-report.html # Generated report
└── server/                       # Java server application
    ├── pom.xml                   # Maven configuration
    └── src/
        ├── main/
        │   ├── java/com/benchmark/server/
        │   │   ├── EmbeddedTomcat.java       # Server entry point
        │   │   ├── action/
        │   │   │   ├── BenchmarkAction.java  # Benchmark endpoint
        │   │   │   ├── GcAction.java         # GC trigger endpoint
        │   │   │   └── HealthAction.java     # Health endpoint
        │   │   ├── filter/
        │   │   │   └── CorsFilter.java       # CORS handling
        │   │   ├── generator/
        │   │   │   └── EventDataGenerator.java
        │   │   ├── metrics/
        │   │   │   └── RequestMetrics.java   # JVM metrics capture
        │   │   ├── model/
        │   │   │   └── CalendarEvent.java    # Data model
        │   │   └── serialization/
        │   │       ├── SerializerRegistry.java
        │   │       └── *Serializer.java      # 7 format serializers
        │   ├── resources/
        │   │   ├── struts.xml                # Struts routing
        │   │   └── flatbuffers/
        │   │       └── calendar_event.fbs    # FlatBuffers schema
        │   └── webapp/WEB-INF/
        │       └── web.xml                   # Servlet configuration
        └── test/                             # JUnit tests
```

---

## License

This project is for internal benchmarking purposes. License to be determined.
