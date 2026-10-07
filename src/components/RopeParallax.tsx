import { useLayoutEffect, useRef } from "react";

// A single thread loops through the margins; the fixed mask protects the content.
const desktopCord =
  "M690-100C860 80 615 180 665 350S760 510 700 670C650 805 735 900 570 1005S90 1040 55 1190C-65 1350 90 1520 290 1460S1100 1360 1150 1570C1210 1750 1010 1830 1140 2100";
const mobileCord =
  "M365-80C415 80 322 155 360 290S406 455 355 575C302 700 395 770 342 875S-18 845 28 1060C78 1215-10 1310 35 1440S395 1420 363 1620C325 1790 414 1880 363 2040S8 2045 30 2240C60 2430-8 2535 34 2670S398 2760 360 3080";
const clearAreas =
  ".hero-copy, .poster-frame, .section-header, .room-notes > div, .rules-intro, .rules-list, .next-gathering";

export function RopeParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stage = ref.current;
    const page = stage?.parentElement;
    if (!stage || !page) return;

    // This mask stays still while the thread moves underneath it. Measure after
    // responsive layout and font changes, keeping a little breathing room.
    const content = Array.from(page.querySelectorAll<HTMLElement>(clearAreas));
    const narrow = window.matchMedia("(max-width: 600px)");
    const maskContent = () => {
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const padding = narrow.matches ? 8 : 12;
      const boxes: DOMRect[] = [];
      content.forEach((element) => {
        if (!narrow.matches || element.matches(".poster-frame, .next-gathering")) {
          boxes.push(element.getBoundingClientRect());
          return;
        }

        // Portrait layouts have little spare width. Protect the actual text
        // lines instead of the entire column, leaving room for a visible curve.
        const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (text.nextNode()) {
          if (!text.currentNode.textContent?.trim()) continue;
          range.selectNodeContents(text.currentNode);
          boxes.push(...Array.from(range.getClientRects()));
        }
        element.querySelectorAll("button, a, svg").forEach((control) => {
          boxes.push(control.getBoundingClientRect());
        });
      });
      const holes = boxes
        .filter((box) => box.width && box.height)
        .map((box) =>
          `<rect x="${box.left - bounds.left - padding}" y="${box.top - bounds.top - padding}" width="${box.width + padding * 2}" height="${box.height + padding * 2}" fill="black"/>`
        )
        .join("");
      const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}"><defs><mask id="clear" maskUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="white"/>${holes}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#clear)"/></svg>`;
      const image = `url("data:image/svg+xml,${encodeURIComponent(mask)}")`;
      stage.style.maskImage = image;
      stage.style.webkitMaskImage = image;
      stage.dataset.ready = "true";
    };
    const resize = new ResizeObserver(maskContent);
    resize.observe(stage);
    content.forEach((element) => resize.observe(element));
    maskContent();

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    let previousTime = 0;
    const paint = (time: number) => {
      frame = 0;
      if (motion.matches || document.hidden) return;
      const elapsed = Math.min(time - previousTime || 16, 64);
      previousTime = time;
      const ease = 1 - Math.exp(-elapsed / 180);
      const targetX =
        Math.sin(time / 1900) * (narrow.matches ? 8 : 12) +
        mouseX * (narrow.matches ? 0.15 : 1);
      const targetY =
        Math.cos(time / 2400) * (narrow.matches ? 26 : 18) +
        mouseY - window.scrollY * (narrow.matches ? 0.2 : 0.16);
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      stage.style.setProperty("--rope-x", `${currentX.toFixed(2)}px`);
      stage.style.setProperty("--rope-y", `${currentY.toFixed(2)}px`);
      frame = window.requestAnimationFrame(paint);
    };
    const syncMotion = () => {
      window.cancelAnimationFrame(frame);
      previousTime = 0;
      if (motion.matches) {
        currentX = currentY = 0;
        stage.style.setProperty("--rope-x", "0px");
        stage.style.setProperty("--rope-y", "0px");
      } else if (!document.hidden) {
        frame = window.requestAnimationFrame(paint);
      }
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      mouseX = (event.clientX / window.innerWidth - 0.5) * 32;
      mouseY = (event.clientY / window.innerHeight - 0.5) * 24;
    };
    const resetPointer = () => {
      mouseX = mouseY = 0;
    };
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("blur", resetPointer);
    document.addEventListener("visibilitychange", syncMotion);
    motion.addEventListener("change", syncMotion);
    syncMotion();

    return () => {
      resize.disconnect();
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("visibilitychange", syncMotion);
      motion.removeEventListener("change", syncMotion);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="rope-stage" ref={ref} aria-hidden="true">
      <svg
        className="red-cord red-cord-desktop"
        viewBox="0 0 1200 2000"
        preserveAspectRatio="none"
        fill="none"
      >
        <path d={desktopCord} vectorEffect="non-scaling-stroke" />
      </svg>
      <svg
        className="red-cord red-cord-mobile"
        viewBox="0 0 400 3000"
        preserveAspectRatio="none"
        fill="none"
      >
        <path d={mobileCord} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
