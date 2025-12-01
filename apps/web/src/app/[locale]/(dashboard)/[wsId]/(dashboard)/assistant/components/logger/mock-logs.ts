import type { StreamingLog } from '../../multimodal-live';

// Use a fixed date for mock data to avoid hydration issues
const MOCK_DATE = new Date('2024-01-01T00:00:00Z');

const soundLogs = (n: number): StreamingLog[] =>
  new Array(n).fill(0).map(
    (): StreamingLog => ({
      date: MOCK_DATE,
      type: 'server.audio',
      message: 'buffer (11250)',
    })
  );

const realtimeLogs = (n: number): StreamingLog[] =>
  new Array(n).fill(0).map(
    (): StreamingLog => ({
      date: MOCK_DATE,
      type: 'client.realtimeInput',
      message: 'audio',
    })
  );

export const mockLogs: StreamingLog[] = [
  {
    date: MOCK_DATE,
    type: 'client.open',
    message: 'connected to socket',
  },
  ...realtimeLogs(10),
  ...soundLogs(10),
  {
    date: MOCK_DATE,
    type: 'receive.content',
    message: {
      serverContent: {
        interrupted: true,
      },
    },
  },
  {
    date: MOCK_DATE,
    type: 'receive.content',
    message: {
      serverContent: {
        turnComplete: true,
      },
    },
  },
  //this one is just a string
  // {
  //   date: MOCK_DATE,
  //   type: "server.send",
  //   message: {
  //     serverContent: {
  //       turnComplete: true,
  //     },
  //   },
  // },
  ...realtimeLogs(10),
  ...soundLogs(20),
  {
    date: MOCK_DATE,
    type: 'receive.content',
    message: {
      serverContent: {
        modelTurn: {
          parts: [{ text: 'Hey its text' }, { text: 'more' }],
        },
      },
    },
  },
  {
    date: MOCK_DATE,
    type: 'client.send',
    message: {
      clientContent: {
        turns: [
          {
            role: 'User',
            parts: [
              {
                text: 'How much wood could a woodchuck chuck if a woodchuck could chuck wood',
              },
            ],
          },
        ],
        turnComplete: true,
      },
    },
  },
  {
    date: MOCK_DATE,
    type: 'server.toolCall',
    message: {
      toolCall: {
        functionCalls: [
          {
            id: 'akadjlasdfla-askls',
            name: 'take_photo',
            args: {},
          },
          {
            id: 'akldjsjskldsj-102',
            name: 'move_camera',
            args: { x: 20, y: 4 },
          },
        ],
      },
    },
  },
  {
    date: MOCK_DATE,
    type: 'server.toolCallCancellation',
    message: {
      toolCallCancellation: {
        ids: ['akladfjadslfk', 'adkafsdljfsdk'],
      },
    },
  },
  {
    date: MOCK_DATE,
    type: 'client.toolResponse',
    message: {
      toolResponse: {
        functionResponses: [
          {
            response: { success: true },
            id: 'akslaj-10102',
          },
        ],
      },
    },
  },
];
