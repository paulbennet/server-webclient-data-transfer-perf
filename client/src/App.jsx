import { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Toolbar,
  Typography
} from "@mui/material";
import { FORMATS, SIZE_PRESETS } from "./bench/formats.js";
import { runBenchmark } from "./bench/benchApi.js";

const initialRows = FORMATS.map((format) => ({
  formatId: format.id,
  status: "idle"
}));

export default function App() {
  const [sizePreset, setSizePreset] = useState("small");
  const [rows, setRows] = useState(initialRows);
  const [running, setRunning] = useState(false);

  const publishResults = (payload) => {
    if (typeof window !== "undefined") {
      window.__benchResults = payload;
    }
  };

  const handleRun = async () => {
    setRunning(true);
    const results = [];
    const startedAt = Date.now();
    publishResults({
      status: "running",
      sizePreset,
      startedAt,
      results: []
    });
    for (const format of FORMATS) {
      const result = await runBenchmark(format.id, sizePreset);
      results.push(result);
      setRows((prev) => [
        ...prev.filter((row) => row.formatId !== format.id),
        result
      ]);
      publishResults({
        status: "running",
        sizePreset,
        startedAt,
        results: [...results]
      });
    }
    setRows(results);
    setRunning(false);
    publishResults({
      status: "done",
      sizePreset,
      startedAt,
      completedAt: Date.now(),
      results
    });
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" elevation={0} color="transparent">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Binary Transfer Benchmark
          </Typography>
          <Chip label="Tomcat + Struts2" color="secondary" size="small" />
          <Chip label="React + MUI" color="primary" size="small" />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center">
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel id="size-label">Dataset size</InputLabel>
              <Select
                labelId="size-label"
                label="Dataset size"
                value={sizePreset}
                onChange={(event) => setSizePreset(event.target.value)}
                data-testid="size-select"
              >
                {SIZE_PRESETS.map((preset) => (
                  <MenuItem key={preset.id} value={preset.value}>
                    {preset.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={handleRun}
              disabled={running}
              data-testid="run-benchmarks"
            >
              {running ? "Running..." : "Run Benchmarks"}
            </Button>
            <Typography color="text.secondary">
              Results update after each format finishes.
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3 }} data-testid="bench-results">
          <Stack spacing={2}>
            {rows.map((row) => {
              const label = FORMATS.find((item) => item.id === row.formatId)?.label || row.formatId;
              return (
                <Box
                  key={row.formatId}
                  data-format-id={row.formatId}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr 1fr 1fr",
                    gap: 2,
                    alignItems: "center",
                    borderBottom: "1px solid #eef1f6",
                    py: 1.5
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {label}
                  </Typography>
                  <Typography color="text.secondary">
                    End-to-end: {row.endToEndMs ? row.endToEndMs.toFixed(2) + " ms" : "-"}
                  </Typography>
                  <Typography color="text.secondary">
                    Client parse: {row.parseMs ? row.parseMs.toFixed(2) + " ms" : "-"}
                  </Typography>
                  <Typography color="text.secondary">
                    Payload: {row.payloadBytes ? row.payloadBytes + " bytes" : "-"}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
