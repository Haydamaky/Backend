import { SecretInfo } from 'src/game/types/secretInfo.type';

export class SecretAnalyzer {
  constructor(private readonly secretInfo: SecretInfo) {}
  isOneUserHaveToPay() {
    return this.secretInfo.users.length === 1 && this.secretInfo.amounts[0] < 0;
  }
  isOneUserHaveToReceive() {
    return this.secretInfo.users.length === 1 && this.secretInfo.amounts[0] > 0;
  }
  inOnePlayerInvolved() {
    return this.secretInfo.numOfPlayersInvolved === 'one';
  }
  isTwoPlayersInvolved() {
    return this.secretInfo.numOfPlayersInvolved === 'two';
  }
  isAllPlayersInvolved() {
    return this.secretInfo.numOfPlayersInvolved === 'all';
  }
}
