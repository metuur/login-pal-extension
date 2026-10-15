"use strict";
function setupPinnedHero() {
  const hero = document.querySelector(".hero-v2 .hero-spotlight");
  if (!hero) return;
  const header = document.querySelector("header.nav");
  const notes = hero.querySelector(".hero-notes");
  const wide = matchMedia("(min-width: 80rem)");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const forcedReduced = new URLSearchParams(location.search).get("reduce") === "1";
  if (forcedReduced) hero.dataset.depthMotion = "reduced";
  let frame = 0;
  let previousOffset = -1;
  const update = () => {
    frame = 0;
    const bounds = hero.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const offset = motion.matches || forcedReduced ? 0 : Math.min(bounds.height, Math.max(0, headerBottom - bounds.top));
    if (offset !== previousOffset) {
      hero.style.setProperty("--hero-scroll-offset", `${offset.toFixed(2)}px`);
      previousOffset = offset;
    }
    if (notes)
      notes.inert = wide.matches && (bounds.bottom <= headerBottom || bounds.top >= innerHeight);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  motion.addEventListener("change", schedule);
  wide.addEventListener("change", schedule);
  notes?.addEventListener("focusin", (event) => {
    if (!wide.matches || !(event.target instanceof HTMLElement)) return;
    const note = event.target.getBoundingClientRect();
    const bounds = hero.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    if (note.bottom > bounds.bottom || note.top < Math.max(bounds.top, headerBottom))
      hero.scrollIntoView({ behavior: "instant", block: "start" });
  });
  update();
}
setupPinnedHero();
