import type { Attendee } from "./event";

export interface OrganizationSession {
  user: Attendee;
  isSystemAdmin: boolean;
  canViewEvents?: boolean;
  expiresAt: number;
}
