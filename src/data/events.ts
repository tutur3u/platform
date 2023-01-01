const today = new Date();

const year = today.getFullYear();
const month = today.getMonth();
const day = today.getDate();

const events = [
  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day, 8, 0),
    end_at: new Date(year, month, day, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day, 12, 45),
    end_at: new Date(year, month, day, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day, 16, 40),
    end_at: new Date(year, month, day, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day, 18, 45),
    end_at: new Date(year, month, day, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 1, 8, 0),
    end_at: new Date(year, month, day + 1, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 1, 12, 45),
    end_at: new Date(year, month, day + 1, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 1, 16, 40),
    end_at: new Date(year, month, day + 1, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 1, 18, 45),
    end_at: new Date(year, month, day + 1, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 2, 8, 0),
    end_at: new Date(year, month, day + 2, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 2, 12, 45),
    end_at: new Date(year, month, day + 2, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 2, 16, 40),
    end_at: new Date(year, month, day + 2, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 2, 18, 45),
    end_at: new Date(year, month, day + 2, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 3, 8, 0),
    end_at: new Date(year, month, day + 3, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 3, 12, 45),
    end_at: new Date(year, month, day + 3, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 3, 16, 40),
    end_at: new Date(year, month, day + 3, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 3, 18, 45),
    end_at: new Date(year, month, day + 3, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 4, 8, 0),
    end_at: new Date(year, month, day + 4, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 4, 12, 45),
    end_at: new Date(year, month, day + 4, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 4, 16, 40),
    end_at: new Date(year, month, day + 4, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 4, 18, 45),
    end_at: new Date(year, month, day + 4, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 5, 8, 0),
    end_at: new Date(year, month, day + 5, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 5, 12, 45),
    end_at: new Date(year, month, day + 5, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 5, 16, 40),
    end_at: new Date(year, month, day + 5, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 5, 18, 45),
    end_at: new Date(year, month, day + 5, 23, 45),
  },

  {
    title: '📨 Catch Up',
    start_at: new Date(year, month, day + 6, 8, 0),
    end_at: new Date(year, month, day + 6, 12, 45),
  },
  {
    title: '📖 Reading',
    start_at: new Date(year, month, day + 6, 12, 45),
    end_at: new Date(year, month, day + 6, 16, 30),
  },
  {
    title: '🚲 Riding',
    start_at: new Date(year, month, day + 6, 16, 40),
    end_at: new Date(year, month, day + 6, 17, 50),
  },
  {
    title: '🎮 Entertainment',
    start_at: new Date(year, month, day + 6, 18, 45),
    end_at: new Date(year, month, day + 6, 23, 45),
  },
].map((event, idx) => ({
  id: idx.toString(),
  ...event,
}));

export default events;
