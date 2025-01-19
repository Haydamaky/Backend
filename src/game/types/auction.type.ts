interface Bidder {
  accepted: boolean;
  userId: string;
  bid: number;
}

export interface Auction {
  fieldIndex: number;
  bidders: Bidder[];
  turnEnds: string;
}
