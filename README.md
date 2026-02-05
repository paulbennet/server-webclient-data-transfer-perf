# Server-Webclient Data Transfer Performance

This repo contains a Java server (Tomcat 9 + Struts2) and a React client (Vite + MUI) for benchmarking binary serialization formats.

## Server (Tomcat 9 + Struts2)

Run embedded Tomcat (dev):

```
mvn -f server/pom.xml -DskipTests compile exec:java -Dexec.mainClass=com.benchmark.server.EmbeddedTomcat -Dserver.port=8090
```

Build the WAR:

```
mvn -f server/pom.xml -DskipTests package
```

Deploy `server/target/server.war` to Tomcat 9.

Default endpoints (embedded at root):

- `http://localhost:8090/api/health`
- `http://localhost:8090/api/bench?format=messagepack&size=small`

### Size presets

- `small`: 1000 events
- `medium`: 10000 events
- `large`: 50000 events

## Client (React + Vite + MUI)

Install dependencies and run dev server:

```
cd client
npm install
npm run dev
```

Set `VITE_SERVER_BASE` to the Tomcat base URL if needed (default: `http://localhost:8090`).

## Benchmark automation (Playwright)

Install client dependencies and Playwright browsers:

```
cd client
npm install
npx playwright install
```

Run the automated benchmark runner (starts server + client, runs Playwright, writes HTML report):

```
npm --prefix client run benchmark:run
```

Environment variables:

- `BENCH_ITERATIONS` (default: 3)
- `BENCH_SERVER_BASE` (default: `http://localhost:8090`)
- `BENCH_CLIENT_BASE` (default: `http://localhost:5173`)
- `BENCH_HEADLESS` (`true` for headless, default: headed)
- `BENCH_TIMEOUT_MS` (default: 600000)
- `BENCH_REPORT_PATH` (default: `client/reports/benchmark-report.html`)

## Notes

- FlexBuffers, FlatBuffers, MessagePack, CBOR, and Apache Arrow are implemented end-to-end.
- FlatBuffers schemas are stored in server resources; regenerate code with flatc if you change them.
