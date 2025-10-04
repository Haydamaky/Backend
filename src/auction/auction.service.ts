import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { Auction } from 'src/game/types/auction.type';
import { TimerService } from 'src/timer/timers.service';
import { PlayerPayload } from 'src/player/player.repository';
import { PlayerService } from 'src/player/player.service';
import { FieldService } from 'src/field/field.service';
import { WebSocketProvider } from 'src/webSocketProvider/webSocketProvider.service';

@Injectable()
export class AuctionService {
  constructor(
    @Inject(forwardRef(() => PlayerService))
    private playerService: PlayerService,
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    private timerService: TimerService,
    private fieldService: FieldService,
    private webSocketProvider: WebSocketProvider
  ) {
    this.hightestInQueue = this.hightestInQueue.bind(this);
    this.winAuction = this.winAuction.bind(this);
    this.setBidderOnAuction = this.setBidderOnAuction.bind(this);
  }
  BID_TIME: number = 10000;
  MIN_RAISE: number = 100;
  auctions: Map<string, Auction> = new Map();
  async putUpForAuction(game: Partial<GamePayload>, requestId: string) {
    const player = await this.getCurrentPlayerOrThrow(game, requestId);
    const field = await this.getAuctionableFieldOrThrow(
      game.id,
      player.currentFieldIndex
    );
    this.timerService.clear(game.id);
    const bidder = this.createInitialBidder(field.price);
    const turnEnds = this.timerService.calculateFutureTime(this.BID_TIME);
    this.setAuction(game.id, {
      fieldIndex: field.index,
      bidders: [bidder],
      turnEnds,
      usersRefused: [game.turnOfUserId],
    });
    return this.getAuction(game.id);
  }
  private async getCurrentPlayerOrThrow(
    game: Partial<GamePayload>,
    requestId?: string
  ) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    if (!player) {
      throw new WsException({ message: 'No such player', requestId });
    }
    return player;
  }
  private async getAuctionableFieldOrThrow(
    gameId: string,
    fieldIndex: number,
    requestId?: string
  ) {
    const fields = await this.fieldService.getGameFields(gameId);
    const field = this.fieldService.findPlayerFieldByIndex(fields, fieldIndex);
    if (!field.price) {
      throw new WsException({
        message: 'This field is not auctionable',
        requestId,
      });
    }
    return field;
  }
  private createInitialBidder(price: number) {
    return {
      bid: price,
      userId: '',
      accepted: true,
    };
  }

  setAuction(gameId: string, auction: Auction) {
    this.auctions.set(gameId, auction);
  }

  getAuction(gameId: string) {
    return this.auctions.get(gameId);
  }

  validateRaisePrice(
    auction: Auction,
    userId: string,
    raiseBy: number,
    bidAmount: number,
    lastBid: number,
    requestId: string
  ) {
    const lastAcceptedBidderOrFirstBid =
      this.findLastAcceptedBidder(auction) || auction.bidders[0];
    console.log({ bidAmount, lastAcceptedBidderOrFirstBid });
    if (bidAmount !== lastAcceptedBidderOrFirstBid.bid)
      throw new WsException({
        message: 'Bid amount is not correct',
        requestId,
      });
    if (lastAcceptedBidderOrFirstBid.bid + raiseBy <= lastBid)
      throw new WsException({
        message: 'Your raise is not big enough',
        requestId,
      });
    if (!auction)
      throw new WsException({ message: 'Auction wasn’t started', requestId });
    if (raiseBy < this.MIN_RAISE)
      throw new WsException({ message: 'Raise is too low', requestId });
    if (auction.usersRefused.includes(userId))
      throw new WsException({
        message: 'You already refused to auction',
        requestId,
      });
  }

  findLastAcceptedBidder(auction: Auction) {
    return auction.bidders.findLast((bidder) => {
      return bidder.accepted && bidder.bid && bidder.userId;
    });
  }

  getLastBidder(auction: Auction) {
    return auction.bidders[auction.bidders.length - 1];
  }

  async raisePrice(
    gameId: string,
    userId: string,
    raiseBy: number,
    bidAmount: number,
    requestId: string
  ) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    const auction = this.getAuction(gameId);
    const lastBidder = this.getLastBidder(auction);
    this.playerService.validatePlayerMoney(player, lastBidder.bid, requestId);
    this.validateRaisePrice(
      auction,
      userId,
      raiseBy,
      bidAmount,
      lastBidder.bid,
      requestId
    );
    this.timerService.clear(gameId);
    this.setBidderOnAuction(gameId, userId, raiseBy, false);
    const auctionWithAcceptedBid = await this.timerService.set(
      gameId,
      200,
      { gameId, userId, raiseBy },
      this.hightestInQueue
    );

    if (auctionWithAcceptedBid) {
      this.webSocketProvider.server
        .to(gameId)
        .emit('raisedPrice', { auction: auctionWithAcceptedBid, requestId });
      this.timerService.set(
        gameId,
        10000,
        { ...auctionWithAcceptedBid, gameId },
        this.winAuction
      );
    } else {
      this.webSocketProvider.server.to(userId).emit('error', {
        requestId,
        message: 'Хтось одночасно поставив з вами і перебив вашу ставку',
      });
    }
  }

  setBidderOnAuction(
    gameId: string,
    userId: string,
    raiseBy: number,
    accepted: boolean
  ) {
    const auction = this.getAuction(gameId);
    const biddder = this.findLastAcceptedBidder(auction) || auction.bidders[0];
    const newBid = biddder.bid + raiseBy;
    const turnEnds = this.timerService.calculateFutureTime(this.BID_TIME);
    auction.bidders[auction.bidders.length] = {
      userId,
      bid: newBid,
      accepted,
    };
    auction.turnEnds = turnEnds;
    this.setAuction(gameId, auction);
    return auction;
  }

  validateRefuseAuction(
    auction: Auction,
    player: Partial<PlayerPayload>,
    requestId: string
  ) {
    if (!player)
      throw new WsException({ message: 'No such player', requestId });
    if (!auction)
      throw new WsException({ message: 'No such auction', requestId });
    const lastBidder = this.getLastBidder(auction);
    if (player.userId === lastBidder.userId) {
      throw new WsException({ message: 'You are the last bidder', requestId });
    }
    if (auction.usersRefused.includes(player.userId))
      throw new WsException({
        message: 'You already refused to auction',
        requestId,
      });
  }

  private addPlayerRefusal(auction: Auction, userId: string): void {
    auction.usersRefused.push(userId);
    auction.bidders.push({ accepted: true, bid: 0, userId });
  }

  private getActivePlayers(game: Partial<GamePayload>): any[] {
    return game.players.filter((player) => !player.lost);
  }

  async refuseAuction(gameId: string, userId: string, requestId: string) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    const auction = this.getAuction(gameId);
    const game = player.game;
    this.validateRefuseAuction(auction, player, requestId);
    this.addPlayerRefusal(auction, userId);
    const activePlayers = this.getActivePlayers(game);
    const isAuctionComplete =
      auction.usersRefused.length >= activePlayers.length;
    if (isAuctionComplete) {
      this.timerService.clear(gameId);
      const hasWinner = !!this.findLastAcceptedBidder(auction);
      if (hasWinner) {
        this.winAuction({ ...auction, gameId });
      } else {
        this.gameService.passTurn(game);
      }
    }
    this.webSocketProvider.server
      .to(gameId)
      .emit('refusedFromAuction', { auction, requestId });
  }

  hightestInQueue(args: { gameId: string; userId: string; raiseBy: number }) {
    const auctionUpdated = this.setBidderOnAuction(
      args.gameId,
      args.userId,
      args.raiseBy,
      true
    );
    return auctionUpdated;
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const { updatedPlayer, fields } =
      await this.processVictoryOfAuction(auction);
    this.webSocketProvider.server
      .to(auction.gameId)
      .emit('wonAuction', { auction, game: updatedPlayer.game, fields });
    this.gameService.passTurn(updatedPlayer.game);
  }

  async processVictoryOfAuction(auction: Auction & { gameId: string }) {
    const fields = await this.fieldService.getGameFields(auction.gameId);
    const field = this.fieldService.findPlayerFieldByIndex(
      fields,
      auction.fieldIndex
    );
    const lastAcceptedBidder = this.findLastAcceptedBidder(auction);
    field.ownedBy = lastAcceptedBidder.userId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        lastAcceptedBidder.userId,
        auction.gameId,
        lastAcceptedBidder.bid
      );
    await this.fieldService.updateFields(fields, ['ownedBy']);
    this.setAuction(auction.gameId, null);
    return { updatedPlayer, fields };
  }
}
