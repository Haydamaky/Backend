import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Player } from '@prisma/client';
import { ChatService } from 'src/chat/chat.service';
import { FieldService } from 'src/field/field.service';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { TwoPlayersInvolvedHandler } from 'src/game/handlers/twoPlayersInvolved.handler';
import { SecretInfo } from 'src/game/types/secretInfo.type';
import { PaymentService } from 'src/payment/payment.service';
import { PlayerService } from 'src/player/player.service';
import secretFields, { SecretType } from 'src/utils/fields/secretFields';
import { SecretAnalyzer } from './secretAnalyzer';
import { HandlerChain } from 'src/common/handlerChain';
import { OnePlayerInvolvedHandler } from 'src/game/handlers/onePlayerInvolved.handler';
import { AllPlayersInvolvedHandler } from 'src/game/handlers/allPlayersInvolved.handler';

@Injectable()
export class SecretService {
  readonly secrets: Map<string, SecretInfo> = new Map();
  constructor(
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

  async payToUserForSecret(game: Partial<GamePayload>, userId: string) {
    let secretInfo = this.secrets.get(game.id);
    if (!secretInfo.users.includes(userId))
      throw new WsException('You cant pay for that secret');
    const amount = secretInfo.amounts[1];
    if (amount > 0)
      throw new WsException('You dont have to pay for this secret field');
    const userToGetId = secretInfo.users[0];
    const indexOfUser = secretInfo.users.indexOf(userId);
    const player = game.players.find((player) => player.userId === userId);
    const fields = await this.fieldService.getGameFields(game.id);
    let updatedPlayer = null;
    let loseGame = false;
    if (player.money < amount) {
      loseGame = true;
      updatedPlayer = await this.playerService.incrementMoneyWithUserAndGameId(
        userToGetId,
        game.id,
        this.playerService.estimateAssets(player, fields)
      );
    } else {
      updatedPlayer = await this.playerService.incrementMoneyWithUserAndGameId(
        userToGetId,
        game.id,
        amount
      );
      await this.playerService.decrementMoneyWithUserAndGameId(
        userId,
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

    return { game: updatedPlayer.game, secretInfo, loseGame };
  }

  async payAllforSecret(game: Partial<GamePayload>) {
    const secretInfo = this.secrets.get(game.id);
    let updatedPlayer = null;
    for (const userId of secretInfo.users) {
      const firstUser = secretInfo.users[0];
      if (userId && userId !== firstUser) {
        if (secretInfo.amounts.length === 2) {
          updatedPlayer = await this.payToUserForSecret(game, userId);
        }

        if (secretInfo.amounts.length === 1) {
          const { playerWhoPayed } = await this.paymentService.transferWithBank(
            game,
            userId,
            secretInfo.amounts[0]
          );
          updatedPlayer = playerWhoPayed;
        }
      }
    }
    this.secrets.delete(game.id);
    return updatedPlayer.game || game;
  }

  async handleSecretWithMessage(game: Partial<GamePayload>) {
    const secret = this.choseRandomSecret();
    const secretInfo = await this.parseAndSaveSecret(secret, game);
    if (secretInfo.text.includes('$RANDOM_PLAYER$')) {
      const randomPlayer = this.playerService.choseRandomPlayer(game.players);
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
          return { loseGame: true, userId: player.userId, fields };
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
          return { loseGame: true, userId: player.userId, fields };
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
    return {
      loseGame: false,
      fields,
      updatedGame: updatedGameToReturn,
    };
  }

  async payToBankForSecret(game: Partial<GamePayload>, userId: string) {
    const secretInfo = this.secrets.get(game.id);
    if (!secretInfo) throw new WsException('No secret found');
    if (!secretInfo.users.includes(userId)) {
      throw new WsException(
        'You cant pay to bank because no user in secretInfo'
      );
    }
    const secretAnalyzer = new SecretAnalyzer(secretInfo, userId);
    const chain = new HandlerChain();
    chain.addHandlers(
      new OnePlayerInvolvedHandler(secretAnalyzer),
      new TwoPlayersInvolvedHandler(secretAnalyzer, this),
      new AllPlayersInvolvedHandler(secretAnalyzer)
    );
    chain.process();
    const lastAmount = secretInfo.amounts[secretInfo.amounts.length - 1];
    const indexOfUser = this.findIndexOfUserIdInSecretInfo(secretInfo, userId);
    secretInfo.users[indexOfUser] = '';
    return lastAmount;
  }
}
