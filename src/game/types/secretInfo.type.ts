export interface SecretInfo {
  amounts: number[];
  users: string[];
  text: string;
  numOfPlayersInvolved: 'one' | 'two' | 'all';
}

export type SecretPayments = SecretInfo[];
