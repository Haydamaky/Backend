import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';

@Controller('game')
export class GameController {
  @Post('/set-cookie')
  setGameSession(@Body() dto, @Res() res) {
    console.log({ dto });
    res.cookie('gameId', dto.gameId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
      ...(process.env.NODE_ENV === 'production' && {
        domain: process.env.DOMAIN_NAME_PROD,
      }),
    });
    return res.status(HttpStatus.OK).send({ success: true });
  }
}
