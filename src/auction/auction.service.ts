import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { GamePayload } from 'src/game/game.repository';
import { GameService } from 'src/game/game.service';
import { Auction } from 'src/game/types/auction.type';
import { PlayerService } from 'src/player/player.service';

@Injectable()
export class AuctionService {
  constructor(
    private gameService: GameService,
    private playerService: PlayerService
  ) {}
  BID_TIME: number = 10000;
  auctions: Map<string, Auction> = new Map();
  async putUpForAuction(game: Partial<GamePayload>) {
    const player = await this.playerService.findByUserAndGameId(
      game.turnOfUserId,
      game.id
    );
    const fields = await this.gameService.getGameFields(game.id);
    if (!player) throw new WsException('No such player');
    const field = this.gameService.findPlayerFieldByIndex(
      fields,
      player.currentFieldIndex
    );
    if (!field.price)
      throw new WsException('You cant put this field to auction');
    this.gameService.clearTimer(game.id);
    const bidder = { bid: field.price, userId: '', accepted: true };
    const turnEnds = this.gameService.calculateEndOfTurn(this.BID_TIME);
    this.setAuction(game.id, {
      fieldIndex: field.index,
      bidders: [bidder],
      turnEnds,
      usersRefused: [game.turnOfUserId],
    });
    return this.getAuction(game.id);
  }

  setAuction(gameId: string, auction: Auction) {
    this.auctions.set(gameId, auction);
  }

  getAuction(gameId: string) {
    return this.auctions.get(gameId);
  }

  findLastAcceptedBid(auction: Auction) {
    return auction.bidders.findLast((bidder) => {
      return bidder.accepted && bidder.bid;
    });
  }

  async raisePrice(
    gameId: string,
    userId: string,
    raiseBy: number,
    bidAmount: number
  ) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    if (!player) throw new WsException('No such player');
    if (player.lost) throw new WsException('You lost the game');
    const auction = this.getAuction(gameId);
    if (!auction) throw new WsException('Auction wasn’t started');
    if (raiseBy < this.gameService.MIN_RAISE)
      throw new WsException('Raise is not big enough');
    if (auction.usersRefused.includes(userId))
      throw new WsException('You refused to auction');
    const lastBid = auction.bidders[auction.bidders.length - 1].bid;
    const lastAcceptedBid = this.findLastAcceptedBid(auction);
    if (bidAmount !== lastAcceptedBid.bid)
      throw new WsException('Bid amount is not correct');
    if (player.money <= lastBid) throw new WsException('Not enough money');
    if (lastAcceptedBid.bid + raiseBy <= lastBid)
      throw new WsException('Bid is not high enough');
    this.gameService.clearTimer(gameId);
    this.setBuyerOnAuction(gameId, userId, raiseBy, false);
    try {
      const { auctionUpdated } = await this.gameService.setTimer(
        gameId,
        200,
        { gameId, userId, raiseBy },
        this.hightestInQueue
      );
      this.gameService.setTimer(
        gameId,
        15000,
        { ...auction, gameId },
        this.winAuction
      );
      return auctionUpdated;
    } catch (e) {
      console.log('Timer was cancelled');
    }
  }

  setBuyerOnAuction(
    gameId: string,
    userId: string,
    raiseBy: number,
    accepted: boolean
  ) {
    const auction = this.getAuction(gameId);
    const indexOfLastOfAccepted = auction.bidders.findLastIndex((bidder) => {
      return bidder.accepted && bidder.bid;
    });
    let bid = auction.bidders[indexOfLastOfAccepted].bid;
    bid += raiseBy;
    const turnEnds = this.gameService.calculateEndOfTurn(this.BID_TIME);
    auction.bidders[auction.bidders.length] = { userId, bid, accepted };
    auction.turnEnds = turnEnds;
    this.setAuction(gameId, auction);
    return auction;
  }

  async refuseAuction(gameId: string, userId: string) {
    const player = await this.playerService.findByUserAndGameId(userId, gameId);
    if (!player) throw new WsException('No such player');
    const auction = this.getAuction(gameId);
    if (!auction) throw new WsException('Auction wasn’t started');
    const lastBid = auction.bidders[auction.bidders.length - 1];
    if (userId === lastBid.userId) {
      throw new WsException('You are the last bidder');
    }
    if (auction.usersRefused.includes(userId))
      throw new WsException('You already refused to auction');
    auction.usersRefused.push(userId);
    auction.bidders.push({ accepted: false, bid: 0, userId });
    if (
      auction.usersRefused.length >=
        player.game.players.filter((player) => !player.lost).length &&
      this.findLastAcceptedBid(auction)
    ) {
      this.gameService.clearTimer(gameId);
      return { auction, hasWinner: true, finished: true, game: player.game };
    }
    if (
      auction.usersRefused.length ===
      player.game.players.filter((player) => !player.lost).length
    ) {
      this.gameService.clearTimer(gameId);
      return { auction, hasWinner: false, finished: true, game: player.game };
    }
    return { auction, hasWinner: false, finished: false, game: player.game };
  }

  async hightestInQueue(args: {
    gameId: string;
    userId: string;
    raiseBy: number;
  }) {
    const auctionUpdated = this.setBuyerOnAuction(
      args.gameId,
      args.userId,
      args.raiseBy,
      true
    );
    return { auctionUpdated };
  }

  async winAuction(auction: Auction & { gameId: string }) {
    const fields = await this.gameService.getGameFields(auction.gameId);
    const field = this.gameService.findPlayerFieldByIndex(
      fields,
      auction.fieldIndex
    );
    const lastBid = this.findLastAcceptedBid(auction);
    field.ownedBy = lastBid.userId;
    const updatedPlayer =
      await this.playerService.decrementMoneyWithUserAndGameId(
        lastBid.userId,
        auction.gameId,
        lastBid.bid
      );
    await this.gameService.updateFields(fields, ['ownedBy']);
    this.setAuction(auction.gameId, null);
    return { updatedPlayer, fields };
  }
}
