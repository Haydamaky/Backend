import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from '../chat.service';
import { ChatRepository } from '../chat.repository';
import { MessageRepository } from 'src/message/message.repository';
import { NewMessagePayloadDto } from '../dto';

describe('ChatService', () => {
  let chatService: ChatService;
  let chatRepository: jest.Mocked<ChatRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: ChatRepository,
          useValue: {
            findUnique: jest.fn(),
          },
        },
        {
          provide: MessageRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    chatService = module.get<ChatService>(ChatService);
    chatRepository = module.get(ChatRepository);
    messageRepository = module.get(MessageRepository);
  });

  describe('onNewMessage', () => {
    it('should create a new message with valid data', async () => {
      const userId = 'user123';
      const messageObj: NewMessagePayloadDto = {
        text: 'Hello, World!',
        chatId: 'chat123',
      };

      const mockMessage: any = {
        id: 'message123',
        text: 'Hello, World!',
        senderId: userId,
        chatId: messageObj.chatId,
        sender: {
          id: userId,
          nickname: 'User123',
          updatedAt: new Date(),
        },
      };

      messageRepository.create.mockResolvedValue(mockMessage);

      const result = await chatService.onNewMessage(userId, messageObj);

      expect(messageRepository.create).toHaveBeenCalledWith({
        data: {
          text: messageObj.text,
          senderId: userId,
          chatId: messageObj.chatId,
        },
        include: {
          sender: {
            select: {
              id: true,
              nickname: true,
              updatedAt: true,
            },
          },
        },
      });

      expect(result).toEqual(mockMessage);
    });

    it('should throw an error if messageRepository.create fails', async () => {
      const userId = 'user123';
      const messageObj: NewMessagePayloadDto = {
        text: 'Hello, World!',
        chatId: 'chat123',
      };

      messageRepository.create.mockRejectedValue(new Error('Database error'));

      await expect(chatService.onNewMessage(userId, messageObj)).rejects.toThrow('Database error');
    });
  });

  describe('onChatData', () => {
    it('should fetch chat data with messages and sender details', async () => {
      const chatId = 'chat123';
      const mockChatData: any = {
        id: chatId,
        messages: [
          {
            id: 'msg1',
            text: 'Hi!',
            sender: {
              id: 'user1',
              nickname: 'John',
            },
          },
          {
            id: 'msg2',
            text: 'Hello!',
            sender: {
              id: 'user2',
              nickname: 'Jane',
            },
          },
        ],
      };

      chatRepository.findUnique.mockResolvedValue(mockChatData);

      const result = await chatService.onChatData(chatId);

      expect(chatRepository.findUnique).toHaveBeenCalledWith({
        where: { id: chatId },
        include: {
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  nickname: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual(mockChatData);
    });

    it('should throw an error if chatRepository.findUnique fails', async () => {
      const chatId = 'chat123';

      chatRepository.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(chatService.onChatData(chatId)).rejects.toThrow('Database error');
    });

    it('should return null if no chat is found', async () => {
      const chatId = 'chat123';

      chatRepository.findUnique.mockResolvedValue(null);

      const result = await chatService.onChatData(chatId);

      expect(result).toBeNull();
    });
  });
});
