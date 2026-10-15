export type AttendanceResponse = "pending" | "going" | "not-going";

export interface EventPerson {
  userId: string;
  name: string;
  response: AttendanceResponse;
}

export interface EventAttendance {
  eventId: string;
  response: AttendanceResponse | null;
  canRespond: boolean;
  rules: { version: string; accepted: boolean };
  groups: { chatId: string; title: string }[];
  people: EventPerson[];
  complete: boolean;
  notice?: string;
}
