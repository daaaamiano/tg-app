import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppAuthProvider } from "./components/AppAuthProvider";
import { initializeTelegram } from "./lib/telegram";
import "./styles.css";

initializeTelegram();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppAuthProvider>
      <App />
    </AppAuthProvider>
  </React.StrictMode>
);
