import { useEffect } from "react";
import Projects from "./Projects";
import Journey from "./Journey";
import Stack from "./Stack";
import BuildLab from "./BuildLab";
import Gallery from "./Gallery";
import Contact from "./Contact";

// Everything under the hero, loaded as one chunk after the first paint so the hero renders in
// a short task. A link to a section (#projekt) still lands right: the browser's own jump
// happened before these sections existed, so it is repeated once they are in the DOM.
export default function BelowFold() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <>
      <Projects />
      <Journey />
      <Stack />
      <BuildLab />
      <Gallery />
      <Contact />
    </>
  );
}
