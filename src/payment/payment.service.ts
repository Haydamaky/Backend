import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
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
    private fieldService: FieldService
  ) {}
  async payToUserForSecret({
    game,
    userId,
  }: {
    game: Partial<GamePayload>;
    userId: string;
  }) {
    let secretInfo = this.secretService.secrets.get(game.id);
    if (!secretInfo.users.includes(userId))
      throw new WsException('You cant pay for that secret');
    const amount = secretInfo.amounts[1];
    if (amount > 0)
      throw new WsException('You dont have to pay for this secret field');
    const userToPayId = secretInfo.users[0];
    const indexOfUser = secretInfo.users.indexOf(userId);
    const player = game.players.find((player) => player.userId === userId);
    const fields = await this.fieldService.getGameFields(game.id);
    let updatedPlayer = null;
    if (player.money < amount) {
      const userToPay = game.players.find(
        (player) => player.userId === userToPayId
      );
      updatedPlayer = await this.playerService.incrementMoneyWithUserAndGameId(
        userToPayId,
        game.id,
        this.playerService.estimateAssets(userToPay, fields)
      );
      await this.playerService.loseGame(player.userId, game.id, fields);
    } else {
      await this.playerService.incrementMoneyWithUserAndGameId(
        userId,
        game.id,
        amount
      );
      updatedPlayer = await this.playerService.decrementMoneyWithUserAndGameId(
        userToPayId,
        game.id,
        amount
      );
    }
    secretInfo.users.splice(indexOfUser, 1, '');
    if (
      secretInfo.users.every((userId, index) => {
        if (secretInfo.amounts[index] > 0) return true;
        return userId === '';
      })
    ) {
      secretInfo = null;
    }

    return { game: updatedPlayer.game, secretInfo };
  }

  async payAllforSecret(game: Partial<GamePayload>) {
    const secretInfo = this.secretService.secrets.get(game.id);
    let updatedPlayer = null;
    for (const userId of secretInfo.users) {
      const firstUser = secretInfo.users[0];
      if (userId && userId !== firstUser) {
        if (secretInfo.amounts.length === 2) {
          updatedPlayer = await this.payToUserForSecret({
            game,
            userId,
          });
        }

        if (secretInfo.amounts.length === 1) {
          const { playerWhoPayed } = await this.transferWithBank(
            game,
            userId,
            secretInfo.amounts[0]
          );
          updatedPlayer = playerWhoPayed;
        }
      }
    }
    this.secretService.secrets.delete(game.id);
    return updatedPlayer.game || game;
  }

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
      const { updatedPlayer, updatedFields } =
        await this.playerService.loseGame(
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

  transferToUser() {}
}
