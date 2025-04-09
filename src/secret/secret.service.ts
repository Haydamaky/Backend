import { Injectable } from '@nestjs/common';
import { Player } from '@prisma/client';
import { GamePayload } from 'src/game/game.repository';
import { SecretInfo } from 'src/game/types/secretInfo.type';
import { SecretType } from 'src/utils/fields/secretFields';

@Injectable()
export class SecretService {
  readonly secrets: Map<string, SecretInfo> = new Map();
  constructor() {}
  getRandomPlayersUserId(players: Partial<Player[]>) {
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex].userId;
  }
  async parseAndSaveSecret(secret: SecretType, game: Partial<GamePayload>) {
    if (secret.numOfPlayersInvolved === 'one') {
      const secretInfo = {
        amounts: secret.amounts,
        users: [game.turnOfUserId],
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
      };
      this.secrets.set(game.id, secretInfo);
      return secretInfo;
    }
  }
}
