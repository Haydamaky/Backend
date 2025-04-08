import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { Auction } from 'src/game/types/auction.type';
import { TimerService } from 'src/timer/timers.service';
import { PlayerPayload } from 'src/player/player.repository';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class AuctionService {
  constructor(
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    @Inject(forwardRef(() => PlayerService))
    private playerService: PlayerService,
    private timerService: TimerService
  ) {
    this.hightestInQueue = this.hightestInQueue.bind(this);
    this.winAuction = this.winAuction.bind(this);
    this.setBidderOnAuction = this.setBidderOnAuction.bind(this);
  }
  BID_TIME: number = 10000;
  MIN_RAISE: number = 100;
  auctions: Map<string, Auction> = new Map();
  async putUpForAuction(game: Partial<GamePayload>) {
    const player = await this.getCurrentPlayerOrThrow(game);
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
  private async getCurrentPlayerOrThrow(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    if (!player) {
      throw new WsException('No such player');
    }
    return player;
  }
  private async getAuctionableFieldOrThrow(gameId: string, fieldIndex: number) {
    const fields = await this.gameService.getGameFields(gameId);
    const field = this.gameService.findPlayerFieldByIndex(fields, fieldIndex);
    if (!field.price) {
      throw new WsException('You cant put this field to auction');
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
    lastBid: number
  ) {
    const lastAcceptedBidderOrFirstBid =
      this.findLastAcceptedBidder(auction) || auction.bidders[0];
    if (bidAmount !== lastAcceptedBidderOrFirstBid.bid)
      throw new WsException('Bid amount is not correct');
    if (lastAcceptedBidderOrFirstBid.bid + raiseBy <= lastBid)
      throw new WsException('Bid is not high enough');
    if (!auction) throw new WsException('Auction wasn’t started');
    if (raiseBy < this.MIN_RAISE)
      throw new WsException('Raise is not big enough');
    if (auction.usersRefused.includes(userId))
      throw new WsException('You refused to auction');
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
    bidAmount: number
  ) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    const auction = this.getAuction(gameId);
    const lastBidder = this.getLastBidder(auction);
    this.playerService.validatePlayerMoney(player, lastBidder.bid);
    this.validateRaisePrice(
      auction,
      userId,
      raiseBy,
      bidAmount,
      lastBidder.bid
    );
    this.timerService.clear(gameId);
    this.setBidderOnAuction(gameId, userId, raiseBy, false);
    return this.timerService.set(
      gameId,
      2000,
      { gameId, userId, raiseBy },
      this.hightestInQueue
    );
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

  validateRefuseAuction(auction: Auction, player: Partial<PlayerPayload>) {
    if (!player) throw new WsException('No such player');
    if (!auction) throw new WsException('Auction wasn’t started');
    const lastBidder = this.getLastBidder(auction);
    if (player.userId === lastBidder.userId) {
      throw new WsException('You are the last bidder');
    }
    if (auction.usersRefused.includes(player.userId))
      throw new WsException('You already refused to auction');
  }

  private addPlayerRefusal(auction: Auction, userId: string): void {
    auction.usersRefused.push(userId);
    auction.bidders.push({ accepted: true, bid: 0, userId });
  }

  private getActivePlayers(game: Partial<GamePayload>): any[] {
    return game.players.filter((player) => !player.lost);
  }

  async refuseAuction(gameId: string, userId: string) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    const auction = this.getAuction(gameId);
    const game = player.game;
    this.validateRefuseAuction(auction, player);
    this.addPlayerRefusal(auction, userId);
    const activePlayers = this.getActivePlayers(game);
    const isAuctionComplete =
      auction.usersRefused.length >= activePlayers.length;
    if (isAuctionComplete) {
      this.timerService.clear(gameId);
      const hasWinner = !!this.findLastAcceptedBidder(auction);
      return {
        auction,
        hasWinner,
        finished: true,
        game,
      };
    }
    return {
      auction,
      hasWinner: false,
      finished: false,
      game,
    };
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
    const fields = await this.gameService.getGameFields(auction.gameId);
    const field = this.gameService.findPlayerFieldByIndex(
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
    await this.gameService.updateFields(fields, ['ownedBy']);
    this.setAuction(auction.gameId, null);
    return { updatedPlayer, fields };
  }
}
