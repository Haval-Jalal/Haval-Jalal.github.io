import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ContentProvider } from "./lib/content";

// Three entry points share one bundle: the public site, the admin panel and the stand-alone
// prototype page. No router needed (yet): Static Web Apps rewrites every path to index.html.
const Admin = lazy(() => import("./admin/Admin"));
const LabPage = lazy(() => import("./pages/LabPage"));
const CvBuilder = lazy(() => import("./pages/CvBuilder"));
const path = window.location.pathname;
const page = path.startsWith("/admin") ? "admin" : path.startsWith("/lab/") ? "lab" : path === "/cv" || path === "/cv/" ? "cv" : "site";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContentProvider>
      {page === "site" ? (
        <App />
      ) : (
        <Suspense fallback={<div className="min-h-screen bg-night-950" />}>
          {page === "admin" ? <Admin /> : page === "cv" ? <CvBuilder /> : <LabPage />}
        </Suspense>
      )}
    </ContentProvider>
  </StrictMode>,
);
