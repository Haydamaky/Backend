export interface Bidder {
  accepted: boolean;
  userId: string;
  bid: number;
}

export interface Auction {
  bidTimeSec: number;
  fieldIndex: number;
  bidders: Bidder[];
  turnEnds: string;
  usersRefused: string[];
}
