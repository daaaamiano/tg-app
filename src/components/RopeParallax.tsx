import { useEffect, useRef } from "react";

const strands = [
  {
    name: "rope-left",
    path: "M-70-80C240 60 70 165 280 190S560 140 495 320C457 433 255 429 276 298C294 184 475 235 490 379S670 523 717 715",
  },
  {
    name: "rope-right",
    path: "M910-80C895 130 685 76 774 274S1170 274 1066 434C995 544 797 468 898 365S1136 453 1041 686C1009 765 1174 850 1280 793",
  },
];

export function RopeParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      if (!ref.current) return;
      ref.current.style.setProperty(
        "--rope-scroll",
        `${motion.matches ? 0 : Math.min(window.scrollY, 700)}px`
      );
      ref.current.style.setProperty("--rope-x", `${motion.matches ? 0 : x}px`);
      ref.current.style.setProperty("--rope-y", `${motion.matches ? 0 : y}px`);
    };
    const requestPaint = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = (event.clientX / window.innerWidth - 0.5) * 20;
      y = (event.clientY / window.innerHeight - 0.5) * 16;
      requestPaint();
    };
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("pointermove", pointer, { passive: true });
    motion.addEventListener("change", requestPaint);
    paint();
    return () => {
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("pointermove", pointer);
      motion.removeEventListener("change", requestPaint);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="rope-stage" ref={ref} aria-hidden="true">
      {strands.map(({ name, path }, index) => (
        <svg
          key={name}
          className={`rope-layer ${name}`}
          viewBox="0 0 1200 850"
          fill="none"
        >
          <defs>
            <pattern
              id={`rope-fiber-${index}`}
              width="11"
              height="11"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(18)"
            >
              <path
                d="M-3 11L11-3M3 17L17 3"
                stroke="#4f4637"
                strokeWidth="2"
                opacity=".5"
              />
              <path
                d="M-1 11L11-1M5 17L17 5"
                stroke="#d4c5a9"
                strokeWidth="1.4"
                opacity=".75"
              />
            </pattern>
          </defs>
          <path
            d={path}
            stroke="#342e24"
            strokeWidth="23"
            opacity=".1"
            transform="translate(3 6)"
          />
          <path d={path} stroke="#746449" strokeWidth="20" />
          <path d={path} stroke="#ae9c7c" strokeWidth="16" />
          <path
            d={path}
            stroke={`url(#rope-fiber-${index})`}
            strokeWidth="18"
          />
          <path d={path} stroke="#d9ccb4" strokeWidth="1" opacity=".7" />
        </svg>
      ))}
    </div>
  );
}
