import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App.jsx";
import "./index.css";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2f6bff"
    },
    secondary: {
      main: "#ff7a00"
    },
    background: {
      default: "#f4f6fb",
      paper: "#ffffff"
    }
  },
  typography: {
    fontFamily: "\"Avenir Next\", Avenir, \"Segoe UI\", sans-serif"
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
