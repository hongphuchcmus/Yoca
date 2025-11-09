import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./App.css";
import "./index.scss";

const apiDomain: string = import.meta.env.CLIENT_API_DOMAIN;
console.log(`API Domain in client 1: ${apiDomain}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
