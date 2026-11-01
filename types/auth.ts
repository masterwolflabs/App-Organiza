export interface ActiveSession {
  userId: string;
  email: string;
  displayName: string;
  /** Photo from the identity provider (e.g. Google), used until the user sets their own. */
  avatarUrl?: string | null;
}

export type Session = ActiveSession | null;
