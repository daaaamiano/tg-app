export interface GroupMember {
  id: string;
  name: string;
  username?: string;
  isBot: boolean;
  role: "owner" | "administrator" | "member";
}

export interface GroupRoster {
  chatId: string;
  title: string;
  totalMembers: number;
  members: GroupMember[];
  complete: boolean;
  source: "bot-api" | "mtproto";
  notice?: string;
  checkedAt: string;
}

export interface AuthorizedGroup {
  chatId: string;
  title: string;
  approved: boolean;
  botIsAdmin: boolean;
  botIsMember: boolean;
  checkedAt: string;
  verificationError?: string;
}
