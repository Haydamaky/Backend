import { Auction } from './auction.type';

export interface PromisesToWinBid {
  userId: string;
  promise: Promise<{ auctionUpdated: Auction }>;
  reject: (reason?: unknown) => void;
  raiseBy: number;
}
