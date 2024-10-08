import { JwtPayload } from './jwtPayloadType.type';

export type JwtPayloadWithRt = JwtPayload & { refreshToken: string };
