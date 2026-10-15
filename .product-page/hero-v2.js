"use strict";
function setupHeroDepth() {
  const hero = document.querySelector(".hero-v2 .hero-spotlight");
  if (!hero) return;
  const pointer = matchMedia("(hover: hover) and (pointer: fine)");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = matchMedia("(min-width: 48rem)");
  const forcedReduced = new URLSearchParams(location.search).get("reduce") === "1";
  if (forcedReduced) hero.dataset.depthMotion = "reduced";
  let frame = 0;
  let x = 0;
  let y = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    hero.style.removeProperty("--hero-drift-x");
    hero.style.removeProperty("--hero-drift-y");
  };
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || !pointer.matches || motion.matches || !desktop.matches || forcedReduced)
      return;
    x = event.clientX;
    y = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      const clamp = (value) => Math.max(-1, Math.min(1, value));
      const horizontal = clamp(((x - bounds.left) / bounds.width - 0.5) * 2);
      const vertical = clamp(((y - bounds.top) / Math.min(bounds.height, 700) - 0.5) * 2);
      hero.style.setProperty("--hero-drift-x", `${(horizontal * 8).toFixed(2)}px`);
      hero.style.setProperty("--hero-drift-y", `${(vertical * 5).toFixed(2)}px`);
    });
  });
  hero.addEventListener("pointerleave", reset);
  hero.addEventListener("pointercancel", reset);
  pointer.addEventListener("change", reset);
  motion.addEventListener("change", reset);
  desktop.addEventListener("change", reset);
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  window.addEventListener("scroll", reset, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}
setupHeroDepth();
