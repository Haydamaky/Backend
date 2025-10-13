import { Game, Player, User, GameStatus, ChatType } from '@prisma/client';

export type GameWithRelations = Game & {
  players: (Player & {
    user: Pick<User, 'id' | 'nickname'>;
  })[];
  currentPlayer: Player | null;
  winner: User | null;
  chat?: {
    id: string;
  };
};

export type GameWithPlayers = Game & {
  players: Player[];
  currentPlayer: Player | null;
};

export type CreateGameData = {
  playersCapacity: number;
  players: {
    create: {
      userId: string;
      color: string;
    };
  };
  turnEnds: string;
};

export type StartGameData = {
  status: GameStatus;
  turnOfUserId: string;
  turnEnds: string;
  chat: {
    create: {
      type: ChatType;
      participants: {
        createMany: {
          data: Array<{ userId: string }>;
        };
      };
    };
  };
};

export type GameInclude = {
  players: {
    include: {
      user: {
        select: {
          id: boolean;
          nickname: boolean;
        };
      };
    };
    orderBy: {
      createdAt: 'asc';
    };
  };
  properties?: boolean;
  currentPlayer?: boolean;
  winner?: boolean;
  chat?: {
    select: {
      id: boolean;
    };
  };
};
