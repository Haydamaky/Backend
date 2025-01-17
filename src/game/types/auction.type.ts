interface Bidder {
  userId: string;
  bid: number;
}

export interface Auction {
  fieldIndex: number;
  bidders: Bidder[];
}
