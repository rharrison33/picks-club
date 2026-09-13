export type User = {
  id: string;
  email: string;
  name: string;
  favoriteTeams: string[];
  photoUrl?: string;
  venmoUrl?: string;
  emailVerified?: boolean;
  ageConfirmed?: boolean;
};
export type Member = {
  id: string;
  name: string;
  photoUrl?: string;
  venmoUrl?: string;
  role: "organizer" | "player";
};
export type Pool = {
  id: string;
  name: string;
  timezone: string;
  defaultFeeCents: number;
  prizePercentages: number[];
  venmoUrl: string;
  role: "organizer" | "player";
  inviteCode?: string;
  members: Member[];
};
export type TeamDetails = {
  name: string;
  rank: number | null;
  logo: string | null;
  record: string | null;
  conference: string | null;
};
export type Game = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
  home: TeamDetails;
  away: TeamDetails;
  odds: {
    provider: string;
    spread: number | null;
    formattedSpread: string | null;
    total: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
  } | null;
  recommendation: { mustWatch: boolean; score: number; reasons: string[] };
};
export type Slate = {
  games: Game[];
  suggestedIds: number[];
  selectionNote: string;
  rankingWeek: number | null;
  oddsAvailable: boolean;
  saturday: string;
  week: number;
};
export type Week = {
  gameCount: number;
  tiebreakerGameId: number | null;
  saturday: string;
  feeCents: number;
  prizePercentages: number[];
  published: boolean;
  saved: boolean;
  games: Game[];
  paymentsEnabled: false;
};
export type Config = {
  timezones: string[];
  nextSaturday: string;
  emailEnabled: boolean;
  requireVerified: boolean;
  registrationRestricted: boolean;
};
