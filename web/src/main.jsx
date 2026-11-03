import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/600.css";
import "./index.css";
import App from "./App.jsx";
import { TooltipProvider } from "@/components/ui/tooltip";

createRoot(document.getElementById("root")).render(<TooltipProvider><App /></TooltipProvider>);
