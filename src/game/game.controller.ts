import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';

@Controller('game')
export class GameController {
  @Post('/set-cookie')
  setGameSession(@Body() dto, @Res() res) {
    console.log({ dto });
    res.cookie('gameId', dto.gameId, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      domain: 'plankton-app-sfddt.ondigitalocean.app',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(HttpStatus.OK).send({ success: true });
  }
}
