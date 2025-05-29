import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { PlayerService } from 'src/player/player.service';
import { SecretService } from 'src/secret/secret.service';
import { TimerService } from 'src/timer/timers.service';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(forwardRef(() => SecretService))
    private secretService: SecretService,
    private playerService: PlayerService,
    private timerService: TimerService,
    private fieldService: FieldService,
    @Inject(forwardRef(() => GameService))
    private gameService: GameService
  ) {}

  async transferWithBank(
    game: Partial<GamePayload>,
    userId: string,
    amount: number
  ) {
    const secretInfo = this.secretService.secrets.get(game.id);
    if (!secretInfo) this.timerService.clear(game.id);
    const currentPlayer = game.players.find(
      (player) => player.userId === userId
    );
    const fields = await this.fieldService.getGameFields(game.id);
    if (currentPlayer.money < amount) {
      // We can add pledging of last owned field or smt to not make player lose immidiately
      const { updatedPlayer, updatedFields } = await this.gameService.loseGame(
        currentPlayer.userId,
        game.id,
        fields
      );
      return { updatedGame: updatedPlayer.game, fields: updatedFields };
    }
    const playerWhoPayed =
      await this.playerService.incrementMoneyWithUserAndGameId(
        currentPlayer.userId || game.turnOfUserId,
        game.id,
        amount
      );
    if (secretInfo && secretInfo.users.includes(userId)) {
      const userIndex = secretInfo.users.findIndex(
        (userId) => userId === playerWhoPayed.userId
      );
      secretInfo.users[userIndex] = '';
    }
    if (
      secretInfo &&
      secretInfo.users.every((userId, index) => {
        if (secretInfo.users.length === 2 && userId !== '') {
          return secretInfo.amounts[index] > 0;
        }
        if (secretInfo.users.length > 2 && index === 0) {
          return true;
        }
        return userId === '';
      })
    ) {
      this.secretService.secrets.delete(game.id);
      return {
        updatedGame: playerWhoPayed.game,
        fields,
        playerWhoPayed,
      };
    }
    return {
      updatedGame: playerWhoPayed.game,
      fields,
      playerWhoPayed,
    };
  }
}
