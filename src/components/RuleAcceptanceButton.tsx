import { Check } from "lucide-react";

export function RuleAcceptanceButton({ label, accepted, disabled = false, onChange }: {
  label: string;
  accepted: boolean;
  disabled?: boolean;
  onChange: (accepted: boolean) => void;
}) {
  return <button
    type="button"
    className="rule-acceptance-button"
    aria-label={`${accepted ? "Agreed to" : "Agree to"} ${label}`}
    aria-pressed={accepted}
    disabled={disabled}
    onClick={() => { if (!disabled) onChange(!accepted); }}
  >
    {accepted && <Check size={16} aria-hidden="true" />}
    <span>{accepted ? "Agreed" : "I agree"}</span>
  </button>;
}
