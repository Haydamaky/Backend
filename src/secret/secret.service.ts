import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Player } from '@prisma/client';
import { ChatService } from 'src/chat/chat.service';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { SecretInfo } from 'src/game/types/secretInfo.type';
import { PaymentService } from 'src/payment/payment.service';
import { PlayerService } from 'src/player/player.service';
import secretFields, { SecretType } from 'src/utils/fields/secretFields';

@Injectable()
export class SecretService {
  readonly secrets: Map<string, SecretInfo> = new Map();
  constructor(
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    private chatService: ChatService,
    private fieldService: FieldService,
    private playerService: PlayerService,
    @Inject(forwardRef(() => PaymentService))
    private paymentService: PaymentService
  ) {}
  getRandomPlayersUserId(players: Partial<Player[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex].userId;
  }
  choseRandomSecret() {
    const randomSecretIndex = Math.floor(Math.random() * secretFields.length);
    return secretFields[randomSecretIndex];
  }

  findIndexOfUserIdInSecretInfo(secretInfo: SecretInfo, userId: string) {
    return secretInfo.users.findIndex(
      (userIdInSecret) => userIdInSecret === userId
    );
  }

  async parseAndSaveSecret(secret: SecretType, game: Partial<GamePayload>) {
    if (secret.numOfPlayersInvolved === 'one') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [game.turnOfUserId],
        text: secret.text,
        numOfPlayersInvolved: secret.numOfPlayersInvolved as 'one',
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    } else if (secret.numOfPlayersInvolved === 'two') {
      const playersWithoutActive = game.players.filter(
        (player) => player.userId !== game.turnOfUserId && !player.lost
      );
      const randomUserId = this.getRandomPlayersUserId(playersWithoutActive);
      const secretInfo = {
        amounts: secret.amounts,
        users: [randomUserId, game.turnOfUserId],
        text: secret.text,
        numOfPlayersInvolved: secret.numOfPlayersInvolved as 'two',
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    } else if (secret.numOfPlayersInvolved === 'all') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [
          game.turnOfUserId,
          ...game.players
            .filter((player) => player.userId !== game.turnOfUserId)
            .map((player) => {
              if (!player.lost && player.userId !== game.turnOfUserId) {
                return player.userId;
              }
              return '';
            }),
        ],
        text: secret.text,
        numOfPlayersInvolved: secret.numOfPlayersInvolved as 'all',
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    }
  }

  async handleSecretWithMessage(game: Partial<GamePayload>) {
    const secret = this.choseRandomSecret();
    const secretInfo = await this.parseAndSaveSecret(secret, game);
    if (secretInfo.text.includes('$RANDOM_PLAYER$')) {
      const randomPlayer = this.gameService.choseRandomPlayer(game.players);
      secretInfo.text = secretInfo.text.replace(
        '$RANDOM_PLAYER$',
        randomPlayer?.user.nickname
      );
    }
    const message = await this.chatService.onNewMessage(game.turnOfUserId, {
      text: secretInfo.text,
      chatId: game.chat.id,
    });
    return { message, secretInfo };
  }

  async resolveTwoUsers(game: Partial<GamePayload>) {
    let secretInfo = this.secrets.get(game.id);
    const firstPay = secretInfo.amounts[0] < 1;
    let updatedGameToReturn: null | Partial<GamePayload> = null;
    const fields = await this.fieldService.getGameFields(game.id);
    if (firstPay) {
      const userId = secretInfo.users[0];
      if (userId) {
        const player = game.players.find((player) => player.userId === userId);
        if (
          this.playerService.estimateAssets(player, fields) <
          secretInfo.amounts[0]
        ) {
          await this.playerService.loseGame(player.userId, game.id, fields);
          return;
        }
        const { updatedGame } = await this.paymentService.transferWithBank(
          game,
          userId,
          secretInfo.amounts[0]
        );
        updatedGameToReturn = updatedGame;
      }
      if (secretInfo.users[1]) {
        const { updatedGame } = await this.paymentService.transferWithBank(
          game,
          secretInfo.users[1],
          secretInfo.amounts[1]
        );
        updatedGameToReturn = updatedGame;
      }
    } else {
      const userId = secretInfo.users[1];
      if (userId) {
        const player = game.players.find((player) => player.userId === userId);
        if (
          this.playerService.estimateAssets(player, fields) <
          secretInfo.amounts[1]
        ) {
          await this.playerService.loseGame(player.userId, game.id, fields);
          return;
        }
        const { updatedGame } = await this.paymentService.transferWithBank(
          game,
          userId,
          secretInfo.amounts[1]
        );
        updatedGameToReturn = updatedGame;
      }
      if (secretInfo.users[0]) {
        const { updatedGame } = await this.paymentService.transferWithBank(
          game,
          secretInfo.users[0],
          secretInfo.amounts[0]
        );
        updatedGameToReturn = updatedGame;
      }
    }
    secretInfo = null;
    return updatedGameToReturn;
  }
}
