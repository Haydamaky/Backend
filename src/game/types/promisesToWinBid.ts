import { Auction } from './auction.type';

export interface PromisesToWinBid {
  userId: string;
  promise: Promise<{ turnEnds: string; auctionUpdated: Auction }>;
  reject: (reason?: unknown) => void;
  raiseBy: number;
}
