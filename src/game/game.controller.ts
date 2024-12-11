import { Controller, Get, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { Request } from 'express';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('currentGame')
  getCurrentGame(@Req() req: Request) {
    const gameId = req.cookies['gameId'];
    return this.gameService.getCurrentGame(gameId);
  }
}
