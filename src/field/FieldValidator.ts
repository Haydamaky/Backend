import { GamePayload } from 'src/game/game.repository';
import { PlayerPayload } from 'src/player/player.repository';
import { PlayerService } from 'src/player/player.service';
import { FieldDocument } from 'src/schema/Field.schema';

export class FieldValidator {
  private currentPlayer: Partial<PlayerPayload>;

  constructor(
    private field: FieldDocument,
    private game: Partial<GamePayload>,
    private playerService: PlayerService
  ) {
    this.currentPlayer = this.playerService.findPlayerWithTurn(game);
  }
  isOwnedByCurrentUser(): boolean {
    return (
      this.field.ownedBy === this.currentPlayer.userId && this.field.price > 0
    );
  }
  isOwnedByOtherAndNotPledged(): boolean {
    return (
      this.field.ownedBy &&
      this.field.ownedBy !== this.currentPlayer.userId &&
      !this.field.isPledged
    );
  }
  isNotOwned(): boolean {
    return !this.field.ownedBy && this.field.price > 0;
  }
  isAffordableForSomeone(): boolean {
    return this.game.players.some(
      (player) =>
        player.userId !== this.currentPlayer.userId &&
        player.money > this.field.price
    );
  }
  isSpecialField(): boolean {
    return !this.field.price;
  }
  isSkipable(): boolean {
    return (
      (this.field?.specialField && !this.field.secret && !this.field.toPay) ||
      this.field.isPledged
    );
  }
}
