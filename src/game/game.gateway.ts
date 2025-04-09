import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { parse } from 'cookie';
import { Server, Socket } from 'socket.io';
import { HasLostGuard } from 'src/auth/guard';
import { ActiveGameGuard } from 'src/auth/guard/activeGame.guard';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { TurnGuard } from 'src/auth/guard/turn.guard';
import { JwtPayload } from 'src/auth/types/jwtPayloadType.type';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { PlayerPayload } from 'src/player/player.repository';
import { PlayerService } from 'src/player/player.service';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WebSocketServerService } from 'src/webSocketServer/webSocketServer.service';
import { ChatService } from './../chat/chat.service';
import { GetGameId } from './decorators/getGameCookieWs';
import { GamePayload } from './game.repository';
import { GameService } from './game.service';
import { Auction } from './types/auction.type';
import { Trade } from './types/trade.type';
import { FieldDocument } from 'src/schema/Field.schema';
import { AuctionService } from 'src/auction/auction.service';
import { TimerService } from 'src/timer/timers.service';
import { SecretService } from 'src/secret/secret.service';

@WebSocketGateway({
  cors: {
    origin:
      process.env.NODE_ENV === 'development'
        ? process.env.FRONTEND_URL_DEV
        : process.env.FRONTEND_URL_PROD,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
@UseFilters(WebsocketExceptionsFilter)
@UsePipes(new WsValidationPipe())
@UseGuards(WsGuard)
export class GameGateway {
  constructor(
    private gameService: GameService,
    private playerService: PlayerService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private chatService: ChatService,
    private webSocketServer: WebSocketServerService,
    private auctionService: AuctionService,
    private timerService: TimerService,
    private secretService: SecretService
  ) {
    this.rollDice = this.rollDice.bind(this);
    this.putUpForAuction = this.putUpForAuction.bind(this);
    this.passTurnToNext = this.passTurnToNext.bind(this);
    this.winAuction = this.winAuction.bind(this);
    this.payForField = this.payForField.bind(this);
    this.payToBank = this.payToBank.bind(this);
    this.payAll = this.payAll.bind(this);
    this.resolveTwoUsers = this.resolveTwoUsers.bind(this);
  }

  @WebSocketServer()
  private server: Server;

  afterInit(server: Server) {
    this.webSocketServer.setServer(server);
  }

  async handleConnection(socket: Socket & { jwtPayload: JwtPayload }) {
    try {
      const cookies = await this.extractCookies(socket);
      if (!cookies) return;
      const { gameId, userId } = cookies;
      if (!gameId) return;
      if (!userId) return;
      socket.join(userId);
      const game = await this.gameService.getGame(gameId);
      if (!game || game.status !== 'ACTIVE') return;
      const timers = this.timerService.timers;
      if (timers.has(gameId)) {
        this.rejoinGame(socket, gameId);
        return;
      }
      const updatedGame = await this.gameService.updateGameWithNewTurn(game);
      this.rejoinGame(socket, gameId);
      const currentField =
        await this.gameService.findCurrentFieldFromGame(game);
      let timerCallback: (args: unknown) => Promise<void>;
      if (game.dices) {
        timerCallback = currentField?.price
          ? this.putUpForAuction
          : this.passTurnToNext;
      } else {
        timerCallback = this.rollDice;
      }

      this.timerService.set(
        gameId,
        updatedGame.timeOfTurn,
        updatedGame,
        timerCallback
      );
    } catch (err) {
      console.log(err);
    }
  }

  private async extractCookies(socket: Socket & { jwtPayload: JwtPayload }) {
    const cookies = socket.handshake.headers.cookie
      ? parse(socket.handshake.headers.cookie)
      : null;

    if (!cookies?.gameId) return null;

    const { gameId, access_token } = cookies;
    const decoded = await this.jwtService.verify(access_token, {
      publicKey: this.configService.get('ACCESS_TOKEN_PUB_KEY'),
    });
    return { gameId, userId: decoded.sub };
  }

  private rejoinGame(socket: Socket, gameId: string) {
    socket.join(gameId);
    socket.emit('rejoin');
  }

  private leaveAllRoomsExceptInitial(socket: Socket) {
    const rooms = socket.rooms;
    let i = 0;
    rooms.forEach((room) => {
      if (i !== 0) {
        socket.leave(room);
      }
      i++;
    });
  }

  @SubscribeMessage('getVisibleGames')
  async getVisibleGames() {
    const games = await this.gameService.getVisibleGames();
    return games;
  }

  @SubscribeMessage('getGameData')
  async getGameData(@GetGameId() gameId: string) {
    const game = await this.gameService.getGame(gameId);
    const auction = this.auctionService.auctions.get(game.id);
    const secretInfo = this.secretService.secrets.get(game.id);
    const fields = await this.gameService.getGameFields(game.id);
    this.server.emit('gameData', { game, fields, auction, secretInfo });
  }

  @SubscribeMessage('joinGame')
  async onJoinGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const { game, shouldStart } = await this.gameService.onJoinGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      socket.join(data.id);
      this.server.emit('onParticipateGame', game);
      if (shouldStart) {
        // We can setTimeout here for some countdown on frontend
        this.server.emit('clearStartedGame', {
          gameId: game.id,
        });
        this.server.to(game.id).emit('startGame', {
          game,
          chatId: game.chat.id,
        });
        this.timerService.set(game.id, game.timeOfTurn, game, this.rollDice);
      }
    }
  }

  @SubscribeMessage('leaveGame')
  async onLeaveGame(
    socket: Socket & { jwtPayload: JwtPayload },
    data: { id: string }
  ) {
    const game = await this.gameService.onLeaveGame(
      data.id,
      socket.jwtPayload.sub
    );
    if (game) {
      this.leaveAllRoomsExceptInitial(socket);
      this.server.emit('onParticipateGame', {
        id: data.id,
        players: game.players,
      });
    }
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('rollDice')
  async onRollDice(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    if (socket.game.dices)
      throw new WsException('You have already rolled dices');
    this.timerService.clear(socket.game.id);
    await this.rollDice(socket.game);
  }

  async rollDice(game: Partial<GamePayload>) {
    const {
      updatedGame,
      nextIndex,
      playerNextField,
      hasOwner,
      currentPlayer,
      fields,
    } = await this.gameService.makeTurn(game);
    if (
      playerNextField.price &&
      playerNextField.ownedBy === updatedGame?.turnOfUserId
    ) {
      this.timerService.set(game.id, 2500, updatedGame, this.passTurnToNext);
    }
    this.server.to(game.id).emit('rolledDice', {
      fields,
      playerNextField,
      hasOwner,
      moveToIndex: nextIndex,
      game: updatedGame,
    });
    if (
      hasOwner &&
      playerNextField.ownedBy !== currentPlayer.userId &&
      !playerNextField.isPledged
    ) {
      this.steppedOnPrivateField(currentPlayer, playerNextField, updatedGame);
      return;
    }
    if (playerNextField.price && !playerNextField.ownedBy) {
      if (
        updatedGame.players.some(
          (player) => player.money > playerNextField.price
        )
      ) {
        this.timerService.set(
          game.id,
          game.timeOfTurn,
          updatedGame,
          this.putUpForAuction
        );
      } else {
        this.timerService.set(game.id, 2500, updatedGame, this.passTurnToNext);
      }
    }

    if (!playerNextField.price) {
      // this.timerService.set(
      //   game.id,
      //   game.timeOfTurn,
      //   updatedGame,
      //   this.passTurnToNext
      // );
      this.processSpecialField(updatedGame, playerNextField);
    }
    const currentField =
      await this.gameService.findCurrentFieldWithUserId(updatedGame);
    if (
      currentField?.specialField &&
      !currentField.secret &&
      !currentField.toPay
    ) {
      this.timerService.set(game.id, 2500, updatedGame, this.passTurnToNext);
    }

    if (playerNextField.isPledged) {
      this.timerService.set(game.id, 2500, updatedGame, this.passTurnToNext);
    }
  }

  async processSpecialField(
    game: Partial<GamePayload>,
    playerNextField: FieldDocument
  ) {
    if (playerNextField.toPay) {
      this.timerService.set(
        game.id,
        game.timeOfTurn,
        { game, userId: game.turnOfUserId, amount: playerNextField.toPay },
        this.payToBank
      );
    }
    if (playerNextField.secret) {
      const secret = this.gameService.getRandomSecret();
      const secretInfo = await this.secretService.parseAndSaveSecret(
        secret,
        game
      );
      const randomPlayer = game.players.find(
        (player) => player.userId === secretInfo.users[1]
      );
      if (secret.text.includes('$RANDOM_PLAYER$')) {
        secret.text = secret.text.replace(
          '$RANDOM_PLAYER$',
          randomPlayer?.user.nickname
        );
      }
      const message = await this.chatService.onNewMessage(game.turnOfUserId, {
        text: secret.text,
        chatId: game.chat.id,
      });
      this.server.to(game.id).emit('gameChatMessage', message);
      this.server.to(game.id).emit('secret', secretInfo);
      secret.text = secret.text.replace(
        randomPlayer?.user.nickname,
        '$RANDOM_PLAYER$'
      );
      if (secretInfo.users.length === 1) {
        if (secretInfo.amounts[0] < 0) {
          this.timerService.set(
            game.id,
            game.timeOfTurn,
            { game, userId: game.turnOfUserId, amount: secretInfo.amounts[0] },
            this.payToBank
          );
        } else {
          this.timerService.set(
            game.id,
            3500,
            { game, userId: game.turnOfUserId, amount: secretInfo.amounts[0] },
            this.payToBank
          );
        }
      } else if (secretInfo.users.length === 2) {
        this.timerService.set(
          game.id,
          game.timeOfTurn,
          game,
          this.resolveTwoUsers
        );
      } else if (secretInfo.users.length > 2) {
        this.timerService.set(game.id, game.timeOfTurn, game, this.payAll);
      }
    }
  }

  async payAll(game: Partial<GamePayload>) {
    const secretInfo = this.secretService.secrets.get(game.id);
    let updatedPlayer = null;
    for (const userId of secretInfo.users) {
      const firstUser = secretInfo.users[0];
      if (userId && userId !== firstUser) {
        if (secretInfo.amounts.length === 2) {
          updatedPlayer = await this.payToUser({
            game,
            userId,
            userToPayId: firstUser,
            amount: secretInfo.amounts[1],
          });
        }

        if (secretInfo.amounts.length === 1) {
          const { playerWhoPayed } = await this.gameService.payToBank(
            game,
            userId,
            secretInfo.amounts[0]
          );
          updatedPlayer = playerWhoPayed;
        }
      }
    }
    this.secretService.secrets.delete(game.id);
    this.passTurnToNext(updatedPlayer?.game || game);
    this.server.to(game.id).emit('updatePlayers', {
      game: updatedPlayer?.game,
    });
  }

  async resolveTwoUsers(game: Partial<GamePayload>) {
    let secretInfo = this.secretService.secrets.get(game.id);
    const firstPay = secretInfo.amounts[0] < 1;
    let updatedGameToReturn: null | Partial<GamePayload> = null;
    const fields = await this.gameService.getGameFields(game.id);
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
        const { updatedGame } = await this.gameService.payToBank(
          game,
          userId,
          secretInfo.amounts[0]
        );
        updatedGameToReturn = updatedGame;
      }
      if (secretInfo.users[1]) {
        const { updatedGame } = await this.gameService.payToBank(
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
        const { updatedGame } = await this.gameService.payToBank(
          game,
          userId,
          secretInfo.amounts[1]
        );
        updatedGameToReturn = updatedGame;
      }
      if (secretInfo.users[0]) {
        const { updatedGame } = await this.gameService.payToBank(
          game,
          secretInfo.users[0],
          secretInfo.amounts[0]
        );
        updatedGameToReturn = updatedGame;
      }
    }
    secretInfo = null;
    this.passTurnToNext(updatedGameToReturn);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('payToUser')
  async onPayToUser(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const game = socket.game;
    const userId = socket.jwtPayload.sub;
    const secretInfo = this.secretService.secrets.get(game.id);
    return this.payToUser({
      game,
      userId,
      userToPayId: secretInfo.users[0],
      amount: secretInfo.amounts[1],
    });
  }

  async payToUser({
    game,
    userId,
    userToPayId,
    amount,
  }: {
    game: Partial<GamePayload>;
    userId: string;
    userToPayId: string;
    amount: number;
  }) {
    let secretInfo = this.secretService.secrets.get(game.id);
    if (!secretInfo.users.includes(userId))
      throw new WsException('You cant pay for that secret');
    const indexOfUser = secretInfo.users.indexOf(userId);
    if (amount > 0)
      throw new WsException('You dont have to pay for this secret field');
    const player = game.players.find((player) => player.userId === userId);
    const fields = await this.gameService.getGameFields(game.id);
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
      updatedPlayer = await this.playerService.incrementMoneyWithUserAndGameId(
        userToPayId,
        game.id,
        -amount
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
    this.server.to(game.id).emit('updatePlayers', {
      game: updatedPlayer.game,
      secretInfo,
    });
    return updatedPlayer;
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('payToBank')
  async onPayToBank(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const currentField = await this.gameService.findCurrentFieldWithUserId(
      socket.game
    );
    const secretInfo = this.secretService.secrets.get(socket.game.id);
    if (!socket.game.dices && !currentField.toPay && !secretInfo)
      throw new WsException(
        'You cant pay for that field because smt is missing'
      );
    let amountToPay = 0;
    if (secretInfo) {
      if (!secretInfo.users.includes(socket.jwtPayload.sub)) {
        throw new WsException(
          'You cant pay to bank because no user in secretInfo'
        );
      }
      if (secretInfo.users.length === 1) {
        if (secretInfo.amounts[0] > 0) {
          throw new WsException(
            'You cant pay to bank because one user and he doesnt have to pay'
          );
        } else {
          amountToPay = secretInfo.amounts[0];
        }
      } else if (secretInfo.users.length === 2) {
        const index = secretInfo.users.findIndex(
          (userId) => userId === socket.jwtPayload.sub
        );
        if (secretInfo.amounts[index] > 0) {
          throw new WsException(
            'You cant pay to bank two users and the one wants to pay dont have to'
          );
        } else {
          amountToPay = secretInfo.amounts[0];
        }
      } else if (
        secretInfo.users.length > 2 &&
        socket.jwtPayload.sub !== secretInfo.users[0]
      ) {
        if (secretInfo.amounts.length === 2) {
          if (secretInfo.amounts[1] > 0) {
            throw new WsException(
              'You cant pay to bank  more then 2 and this doesnt lya lya'
            );
          } else {
            amountToPay = secretInfo.amounts[0];
          }
        }

        if (secretInfo.amounts.length === 1) {
          if (secretInfo.amounts[0] > 0) {
            throw new WsException(
              'You cant pay to bank more than 2 one amount and dont have t'
            );
          } else {
            amountToPay = secretInfo.amounts[0];
          }
        }
        if (
          secretInfo.users.every((userId, index) => {
            if (secretInfo.amounts[index] > 0) return true;
            return userId === '';
          })
        ) {
          throw new WsException(
            'You cant pay to bank every user is empty string'
          );
        }
      }
    }
    if (currentField.toPay) {
      this.payToBank({
        game: socket.game,
        userId: socket.jwtPayload.sub,
        amount: currentField.toPay,
      });
    }
    if (secretInfo) {
      this.payToBank({
        game: socket.game,
        userId: socket.jwtPayload.sub,
        amount: amountToPay,
      });
      const indexOfUser = secretInfo.users.findIndex(
        (userId) => userId === socket.jwtPayload.sub
      );
      secretInfo.users[indexOfUser] = '';
    }
  }

  async payToBank(argsObj: {
    game: Partial<GamePayload>;
    amount: number;
    userId: string;
  }) {
    const { updatedGame } = await this.gameService.payToBank(
      argsObj.game,
      argsObj.userId,
      argsObj.amount
    );
    const secretInfo = this.secretService.secrets.get(updatedGame.id);
    if (!secretInfo) {
      await this.passTurnToNext(updatedGame);
    } else {
      this.server.to(updatedGame.id).emit('updatePlayers', {
        game: updatedGame,
        secretInfo,
      });
    }
  }

  async steppedOnPrivateField(
    player: Partial<PlayerPayload>,
    field: FieldDocument,
    game: Partial<GamePayload>
  ) {
    const fields = await this.gameService.getGameFields(game.id);
    if (
      this.playerService.estimateAssets(player, fields) >=
      field.income[field.amountOfBranches]
    ) {
      this.timerService.set(
        game.id,
        game.timeOfTurn,
        { game, field: field },
        this.payForField
      );
      return;
    }
    const { updatedPlayer } = await this.playerService.loseGame(
      player.userId,
      game.id,
      fields
    );

    await this.passTurnToNext(updatedPlayer.game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('payForField')
  async onPayForField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const currentField = await this.gameService.findCurrentFieldWithUserId(
      socket.game
    );
    if (!socket.game.dices || !currentField.ownedBy)
      throw new WsException('You cant pay for that field');
    this.timerService.clear(socket.game.id);
    await this.payForField({ game: socket.game, field: currentField });
  }

  async payForField({
    game,
    field,
  }: {
    game: Partial<GamePayload>;
    field: FieldDocument;
  }) {
    const { updatedGame, fields: updatedFields } =
      await this.gameService.payForField(game, field);
    this.server.to(game.id).emit('payedForField', {
      game: updatedGame,
      fields: updatedFields,
    });
    this.passTurnToNext(updatedGame);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('putUpForAuction')
  async onPutUpForAuction(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.putUpForAuction(socket.game);
  }

  async putUpForAuction(game: Partial<GamePayload>) {
    const auction = await this.auctionService.putUpForAuction(game);

    const updatedGame = await this.gameService.updateGameWithNewTurn(
      game,
      15000
    );
    this.server
      .to(game.id)
      .emit('hasPutUpForAuction', { game: updatedGame, auction });
    this.timerService.set(game.id, 15000, updatedGame, this.passTurnToNext);
  }

  @SubscribeMessage('createGame')
  async createGame(socket: Socket & { jwtPayload: JwtPayload }) {
    const createdGameWithPlayer = await this.gameService.createGame(
      socket.jwtPayload.sub
    );

    if (!createdGameWithPlayer) {
      return socket.emit('error', {
        message:
          'Ви вже знаходитесь в кімнаті, покиньте її щоб приєднатись до іншої',
      });
    } else {
      socket.join(createdGameWithPlayer.id);
    }

    return this.server.emit('newGameCreated', createdGameWithPlayer);
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('raisePrice')
  async raisePrice(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string,
    @MessageBody('raiseBy') raiseBy: number,
    @MessageBody('bidAmount') bidAmount: number
  ) {
    const userId = socket.jwtPayload.sub;
    const auction = await this.auctionService.raisePrice(
      gameId,
      userId,
      raiseBy,
      bidAmount
    );

    if (auction) {
      this.server.to(gameId).emit('raisedPrice', { auction });
      this.timerService.set(
        gameId,
        15000,
        { ...auction, gameId },
        this.winAuction
      );
    } else {
      this.server.to(userId).emit('error', {
        message: 'Хтось одночасно поставив з вами і перебив вашу ставку',
      });
    }
  }

  @UseGuards(ActiveGameGuard, HasLostGuard)
  @SubscribeMessage('refuseAuction')
  async refuseAuction(
    @ConnectedSocket() socket: Socket & { jwtPayload: JwtPayload },
    @GetGameId() gameId: string
  ) {
    const userId = socket.jwtPayload.sub;
    const { auction, hasWinner, finished, game } =
      await this.auctionService.refuseAuction(gameId, userId);
    if (finished) {
      if (hasWinner) {
        this.winAuction({ ...auction, gameId });
      } else {
        this.passTurnToNext(game);
      }
    } else {
      this.server.to(gameId).emit('refusedFromAuction', { auction });
    }
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const { updatedPlayer, fields } =
      await this.auctionService.winAuction(auction);
    this.server
      .to(auction.gameId)
      .emit('wonAuction', { auction, game: updatedPlayer.game, fields });
    const game = await this.gameService.getGame(auction.gameId);
    this.passTurnToNext(game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('buyField')
  async onBuyField(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    await this.buyField(socket.game);
  }

  async buyField(game: Partial<GamePayload>) {
    await this.gameService.buyField(game);
    this.passTurnToNext(game);
  }

  @UseGuards(ActiveGameGuard, TurnGuard, HasLostGuard)
  @SubscribeMessage('passTurn')
  async onPassTurn(
    @ConnectedSocket()
    socket: Socket & { jwtPayload: JwtPayload; game: Partial<GamePayload> }
  ) {
    const fields = await this.gameService.getGameFields(socket.game.id);
    const currentPlayer = this.playerService.findPlayerWithTurn(socket.game);
    const currentField = this.gameService.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    if (!currentField.large && currentField.ownedBy !== socket.jwtPayload.sub) {
      throw new WsException('You cant pass turn with that field');
    }
    await this.passTurnToNext(socket.game);
  }

  async passTurnToNext(game: Partial<GamePayload>) {
    const { updatedGame } = await this.gameService.passTurnToNext(game);
    const fields = await this.gameService.getGameFields(game.id);
    this.server
      .to(game.id)
      .emit('passTurnToNext', { game: updatedGame, fields });
    this.timerService.set(game.id, game.timeOfTurn, updatedGame, this.rollDice);
  }
  @OnEvent('passTurnToNext')
  async handlePassTurnToNext(data: { game: Partial<GamePayload> }) {
    this.passTurnToNext(data.game);
  }
  @OnEvent('offerTrade')
  async handleOfferTrade(data: { game: Partial<GamePayload>; trade: Trade }) {
    const { updatedGame } = await this.gameService.passTurnToUser({
      game: data.game,
      toUserId: data.trade.toUserId,
    });
    this.server.to(data.game.id).emit('updateGameData', { game: updatedGame });
    this.server
      .to(data.trade.toUserId)
      .emit('tradeOffered', { trade: data.trade });
    this.timerService.set(
      updatedGame.id,
      10000,
      updatedGame,
      this.playerService.refuseFromTrade
    );
  }
  @OnEvent('setRollDiceTimer')
  async handleSetRollDiceTimer(game: Partial<GamePayload>) {
    this.timerService.set(game.id, game.timeOfTurn, game, this.rollDice);
  }
  @OnEvent('setAfterRolledDiceTimer')
  async handleSetAfterRolledDiceTimer(updatedGame: Partial<GamePayload>) {
    const currentPlayer = this.playerService.findPlayerWithTurn(updatedGame);
    const fields = await this.gameService.getGameFields(updatedGame.id);
    const playerNextField = this.gameService.findPlayerFieldByIndex(
      fields,
      currentPlayer.currentFieldIndex
    );
    if (
      playerNextField.price &&
      playerNextField.ownedBy === updatedGame?.turnOfUserId
    ) {
      this.timerService.set(
        updatedGame.id,
        2500,
        updatedGame,
        this.passTurnToNext
      );
    }
    if (
      playerNextField.ownedBy &&
      playerNextField.ownedBy !== currentPlayer.userId
    ) {
      this.steppedOnPrivateField(currentPlayer, playerNextField, updatedGame);
      return;
    }
    if (playerNextField.price && !playerNextField.ownedBy) {
      this.timerService.set(
        updatedGame.id,
        updatedGame.timeOfTurn,
        updatedGame,
        this.putUpForAuction
      );
    }
    if (!playerNextField.price) {
      this.processSpecialField(updatedGame, playerNextField);
    }
    const currentField =
      await this.gameService.findCurrentFieldWithUserId(updatedGame);
    if (
      currentField?.specialField &&
      !currentField.secret &&
      !currentField.toPay
    ) {
      this.timerService.set(
        updatedGame.id,
        12000,
        updatedGame,
        this.passTurnToNext
      );
    }
  }
}
