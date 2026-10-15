// This version requires a separate acknowledgement of every rule.
// Bump when the agreements or confirmation requirements change.
export const houseRulesVersion = "2026-10-15.2";

export const houseRules = [
  {
    id: "consent",
    title: "Consent, always.",
    text: "Only a clear, affirmative, enthusiastic yes means yes. Ask before touching someone, their rope, or their gear. Agree on boundaries and stop signals before starting, and stop immediately when asked.",
  },
  {
    id: "respect",
    title: "Respect each other.",
    text: "Respect everyone’s beliefs and identities.",
  },
  {
    id: "privacy",
    title: "Keep the room private.",
    text: "No photos or videos without authorization. No uninvited guests.",
  },
  {
    id: "non-discrimination",
    title: "No room for discrimination.",
    text: "No racism, sexism, homophobia, transphobia, ableism, body shaming, or harassment. If something feels wrong, tell the host.",
  },
  {
    id: "shared-space",
    title: "Be present. Share the space.",
    text: "Adults 18+ only. No intoxication. Ask the host before using the suspension point, stay within your experience, and make room for others. We’re here to have a good time—help make it a good experience for everyone.",
  },
];

export const houseRuleIds = houseRules.map(rule => rule.id);

export function isCompleteRulesAcceptance(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === houseRuleIds.length
    && new Set(value).size === houseRuleIds.length
    && value.every(id => typeof id === "string" && houseRuleIds.includes(id));
}
