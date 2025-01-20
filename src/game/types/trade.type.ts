export interface Trade {
  offerFieldsIndexes: number[];
  wantedFieldsIndexes: number[];
  offeredMoney: number;
  wantedMoney: number;
  toUserId: string;
  fromUserId: string;
}
