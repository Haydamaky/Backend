import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from '../chat.gateway';
import { ChatService } from '../chat.service';
import { WsGuard } from 'src/auth/guard/jwt.ws.guard';
import { WebsocketExceptionsFilter } from 'src/utils/exceptions/websocket-exceptions.filter';
import { WsValidationPipe } from 'src/pipes/wsValidation.pipe';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

jest.mock('../chat.service');

describe('ChatGateway', () => {
  let chatGateway: ChatGateway;
  let chatService: ChatService;
  let mockServer: { emit: jest.Mock };

  beforeEach(async () => {
    mockServer = { emit: jest.fn() };
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: {
            onNewMessage: jest.fn(),
            onChatData: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
      ],
    })
      .overrideProvider(WsGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideProvider(WebsocketExceptionsFilter)
      .useValue({})
      .overridePipe(WsValidationPipe)
      .useValue({ transform: jest.fn((value) => value) })
      .compile();

    chatGateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get<ChatService>(ChatService);
    chatGateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(chatGateway).toBeDefined();
  });

  describe('onNewMessage', () => {
    it('should call chatService.onNewMessage and emit onMessage event', async () => {
      const mockSocket = {
        jwtPayload: { sub: 'user-id', email: 'test@example.com' },
      } as Socket & { jwtPayload: { sub: string; email: string } };

      const mockData = { content: 'Hello', chatId: 'chat-id', text: 'Hello' };
      const mockMessage = { id: 'message-id', content: 'Hello', chatId: 'chat-id', text: 'Hello' };

      jest.spyOn(chatService, 'onNewMessage').mockResolvedValue(mockMessage);

      await chatGateway.onNewMessage(mockSocket, mockData);

      expect(chatService.onNewMessage).toHaveBeenCalledWith('user-id', mockData);
      expect(mockServer.emit).toHaveBeenCalledWith('onMessage', mockMessage);
    });
  });

  describe('onChatData', () => {
    it('should call chatService.onChatData and return chat data', async () => {
      const mockData = { chatId: 'chat-id' };
      const mockChatData = { id: 'chat-id', messages: [] };

      jest.spyOn(chatService, 'onChatData').mockResolvedValue(mockChatData);

      const result = await chatGateway.onChatData(mockData);

      expect(chatService.onChatData).toHaveBeenCalledWith('chat-id');
      expect(result).toEqual(mockChatData);
    });
  });
});
