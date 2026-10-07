export interface RopeEvent {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  arrivalFrom: string;
  timeZone: string;
  price: number;
  currency: "EUR";
  capacity: number;
  venue: string;
  address: string;
  neighborhood: string;
  city: string;
  poster: string;
  suspensionPoints: number;
  inviteOnly: boolean;
}

export interface EventData {
  events: RopeEvent[];
}

export interface Attendee {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  email?: string;
}
export interface AuthSession {
  user: Attendee;
  mode: "demo" | "telegram-preview" | "verified" | "authkit";
}
