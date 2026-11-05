import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ContentProvider } from "./lib/content";

// Two entry points share one bundle: the public site and the admin panel. No router needed
// (yet): Static Web Apps rewrites every path to index.html and we branch on the pathname.
const Admin = lazy(() => import("./admin/Admin"));
const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContentProvider>
      {isAdmin ? (
        <Suspense fallback={<div className="min-h-screen bg-night-950" />}>
          <Admin />
        </Suspense>
      ) : (
        <App />
      )}
    </ContentProvider>
  </StrictMode>,
);
