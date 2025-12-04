import { create } from 'zustand';
import type { StreamingLog } from '../multimodal-live';

interface StoreLoggerState {
  maxLogs: number;
  logs: StreamingLog[];
  log: (streamingLog: StreamingLog) => void;
  clearLogs: () => void;
}

export const useLoggerStore = create<StoreLoggerState>((set, get) => ({
  maxLogs: 500,
  logs: [], //mockLogs,
  log: ({ date, type, message }: StreamingLog) => {
    set((state) => {
      const prevLog = state.logs.at(-1);
      if (prevLog && prevLog.type === type && prevLog.message === message) {
        return {
          logs: [
            ...state.logs.slice(0, -1),
            {
              date,
              type,
              message,
              count: prevLog.count ? prevLog.count + 1 : 1,
            } as StreamingLog,
          ],
        };
      }
      return {
        logs: [
          ...state.logs.slice(-(get().maxLogs - 1)),
          {
            date,
            type,
            message,
          } as StreamingLog,
        ],
      };
    });
  },

  clearLogs: () => {
    set({ logs: [] });
  },
  setMaxLogs: (n: number) => set({ maxLogs: n }),
}));
