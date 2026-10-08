import { useCallback, useEffect, useRef, useState } from "react";
import { getOrganizationSession, organizationRequest } from "./organization";
import type { OrganizationSession } from "../types/organization";

export function useOrganizationAccount() {
  const [session, setSession] = useState<OrganizationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const mutating = useRef(false);

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const current = ++generation.current;
    try {
      const result = await getOrganizationSession();
      if (current === generation.current) setSession(result);
    } catch {
      if (current === generation.current) setSession(null);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { generation.current++; window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => { generation.current++; setSession(null); }, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  async function authenticate(proof: { initData: string } | { idToken: string }) {
    mutating.current = true;
    const current = ++generation.current;
    try {
      const result = await organizationRequest<{ session: OrganizationSession }>("authenticate", {
        method: "POST", body: JSON.stringify(proof),
      });
      if (current === generation.current) { setSession(result.session); setLoading(false); }
    } finally { mutating.current = false; if (current === generation.current) setLoading(false); }
  }

  async function signOut() {
    mutating.current = true;
    generation.current++;
    try {
      await organizationRequest("logout", { method: "POST" });
      generation.current++;
      setSession(null);
    } finally { mutating.current = false; }
  }

  return { session, loading, refresh, authenticate, signOut };
}
