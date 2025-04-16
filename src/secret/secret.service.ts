import { Injectable } from '@nestjs/common';
import { Player } from '@prisma/client';
import { ChatService } from 'src/chat/chat.service';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { SecretInfo } from 'src/game/types/secretInfo.type';
import secretFields, { SecretType } from 'src/utils/fields/secretFields';

@Injectable()
export class SecretService {
  readonly secrets: Map<string, SecretInfo> = new Map();
  constructor(
    private gameService: GameService,
    private chatService: ChatService
  ) {}
  getRandomPlayersUserId(players: Partial<Player[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex].userId;
  }
  choseRandomSecret() {
    const randomSecretIndex = Math.floor(Math.random() * secretFields.length);
    return secretFields[randomSecretIndex];
  }
  async parseAndSaveSecret(secret: SecretType, game: Partial<GamePayload>) {
    if (secret.numOfPlayersInvolved === 'one') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [game.turnOfUserId],
        text: secret.text,
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
        users: [game.turnOfUserId, randomUserId],
        text: secret.text,
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

  isOneUserHaveToPay(secretInfo: SecretInfo) {
    return secretInfo.users.length === 1 && secretInfo.amounts[0] < 0;
  }
}
