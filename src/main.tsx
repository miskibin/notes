import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import "@milkdown/crepe/theme/common/style.css";
import { applyAppearance } from "./appearance";
import App from "./App";
import { readSettings } from "./settings";
import "./chat-theme.css";
import "./styles.css";
import "./appearance.css";

applyAppearance(readSettings());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
