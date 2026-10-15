import { useEffect, useRef } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { AnimationItem } from "lottie-web";
import { confirmationAnimation, loadingAnimation } from "../lib/animations";

export function LottieAnimation({ kind, className = "" }: { kind: "success" | "loading"; className?: string }) {
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!container.current || typeof document === "undefined") return;
    const target = container.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: AnimationItem | undefined;
    let disposed = false;
    const motionChanged = () => {
      if (!animation) return;
      if (preference.matches) animation.goToAndStop(kind === "success" ? 59 : 24, true);
      else animation.goToAndPlay(0, true);
    };
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (disposed) return;
      animation = lottie.loadAnimation({ container: target, renderer: "svg", loop: kind === "loading", autoplay: !preference.matches,
        animationData: kind === "success" ? confirmationAnimation() : loadingAnimation() });
      target.dataset.ready = "true";
      if (preference.matches) motionChanged();
    }).catch(() => { /* The static icon remains visible if the player cannot load. */ });
    preference.addEventListener("change", motionChanged);
    return () => { disposed = true; preference.removeEventListener("change", motionChanged); animation?.destroy(); delete target.dataset.ready; };
  }, [kind]);
  return <span className={`lottie-animation lottie-${kind} ${className}`} aria-hidden="true">
    {kind === "success" ? <Check className="lottie-fallback" /> : <LoaderCircle className="lottie-fallback" />}
    <span className="lottie-canvas" ref={container} />
  </span>;
}
