import { LottieAnimation } from "./LottieAnimation";
import type { Ref } from "react";

export function ConfirmationButton({ state, disabled = false, onClick, buttonRef, describedBy, label, loadingLabel, successLabel }: {
  state: "idle" | "loading" | "success";
  disabled?: boolean;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  describedBy?: string;
  label: string;
  loadingLabel: string;
  successLabel: string;
}) {
  const blocked = disabled || state !== "idle";
  return <button type="button" ref={buttonRef} className={`primary-button confirmation-button confirmation-${state}`}
    disabled={blocked} aria-busy={state === "loading"} aria-describedby={describedBy}
    onClick={() => { if (!blocked) onClick(); }}>
    {state !== "idle" && <LottieAnimation kind={state === "loading" ? "loading" : "success"} />}
    <span>{state === "loading" ? loadingLabel : state === "success" ? successLabel : label}</span>
  </button>;
}
