import { SecretInfo } from 'src/game/types/secretInfo.type';

export class SecretAnalyzer {
  constructor(
    public readonly secretInfo: SecretInfo,
    public readonly userId: string,
    public readonly requestId?: string
  ) {}
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
  isFirstAndShouldGet() {
    return (
      this.secretInfo.users[0] === this.userId &&
      this.secretInfo.amounts[0] === null
    );
  }
}
