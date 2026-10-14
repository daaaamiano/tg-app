export type UserAccessState = "allowed" | "blocked" | "group";

export interface UserAccessRule {
  userId: string;
  name: string;
  state: Exclude<UserAccessState, "group">;
}
