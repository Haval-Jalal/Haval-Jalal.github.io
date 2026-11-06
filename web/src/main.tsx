import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ContentProvider } from "./lib/content";
import { locale, sitePath } from "./lib/i18n";

// Three entry points share one bundle: the public site, the admin panel and the stand-alone
// prototype page. No router needed (yet): Static Web Apps rewrites every path to index.html.
const Admin = lazy(() => import("./admin/Admin"));
const LabPage = lazy(() => import("./pages/LabPage"));
const CvBuilder = lazy(() => import("./pages/CvBuilder"));
const PitchPage = lazy(() => import("./pages/PitchPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const NowPage = lazy(() => import("./pages/NowPage"));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage"));
const path = sitePath;
document.documentElement.lang = locale;
if (locale === "en") document.title = "Haval Jalal — Software Developer";
const clean = path.replace(/\/$/, "") || "/";
const page = path.startsWith("/admin") ? "admin" : path.startsWith("/lab/") ? "lab" : path.startsWith("/for/") ? "pitch" : clean === "/boka" || clean === "/book" ? "book" : clean === "/cv" ? "cv" : clean === "/nu" || clean === "/now" ? "now" : clean === "/changelog" ? "changelog" : "site";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ContentProvider>
      {page === "site" ? (
        <App />
      ) : (
        <Suspense fallback={<div className="min-h-screen bg-night-950" />}>
          {page === "admin" ? <Admin /> : page === "cv" ? <CvBuilder /> : page === "pitch" ? <PitchPage /> : page === "book" ? <BookingPage /> : page === "now" ? <NowPage /> : page === "changelog" ? <ChangelogPage /> : <LabPage />}
        </Suspense>
      )}
    </ContentProvider>
  </StrictMode>,
);
