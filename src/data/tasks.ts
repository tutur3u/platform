const tasks = [
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 26, 9, 0),
    end: new Date(2022, 11, 26, 9, 15),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 26, 11, 15),
    end: new Date(2022, 11, 26, 11, 55),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 26, 13, 0),
    end: new Date(2022, 11, 26, 16, 15),
  },
  {
    title: '🖥️ Easy: add feedback in class score board view',
    start: new Date(2022, 11, 26, 16, 45),
    end: new Date(2022, 11, 26, 17, 30),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 26, 18, 0),
    end: new Date(2022, 11, 26, 18, 40),
  },
  {
    title: '🖥️ Easy: add feedback in class score board view',
    start: new Date(2022, 11, 26, 20, 0),
    end: new Date(2022, 11, 26, 20, 55),
  },
  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 26, 21, 30),
    end: new Date(2022, 11, 26, 22, 0),
  },
  {
    title: '🖥️ Tuturuuu: polish profile system',
    start: new Date(2022, 11, 26, 22, 0),
    end: new Date(2022, 11, 26, 23, 45), // actually ends at 00:45
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 27, 9, 30),
    end: new Date(2022, 11, 27, 10, 45),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 27, 11, 0),
    end: new Date(2022, 11, 27, 11, 25),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 27, 11, 30),
    end: new Date(2022, 11, 27, 12, 10),
  },
  {
    title: '🤝 Meeting with Figma Team (IPEP)',
    start: new Date(2022, 11, 27, 14, 30),
    end: new Date(2022, 11, 27, 15, 30),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 27, 15, 30),
    end: new Date(2022, 11, 27, 18, 15),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 27, 18, 30),
    end: new Date(2022, 11, 27, 19, 10),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 27, 19, 30),
    end: new Date(2022, 11, 27, 20, 30),
  },
  {
    title: '📖 Reading',
    start: new Date(2022, 11, 27, 20, 45),
    end: new Date(2022, 11, 27, 21, 25),
  },
  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 27, 21, 30),
    end: new Date(2022, 11, 27, 22, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 27, 22, 0),
    end: new Date(2022, 11, 27, 23, 45),
  },
  {
    title: '🍱 Breakfast',
    start: new Date(2022, 11, 28, 7, 0),
    end: new Date(2022, 11, 28, 7, 40),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 28, 8, 0),
    end: new Date(2022, 11, 28, 8, 45),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 28, 9, 0),
    end: new Date(2022, 11, 28, 9, 25),
  },
  {
    title: '🖥️ YirrLab: create homepage and auth forms',
    start: new Date(2022, 11, 28, 9, 45),
    end: new Date(2022, 11, 28, 11, 45),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 28, 12, 0),
    end: new Date(2022, 11, 28, 12, 40),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 28, 13, 0),
    end: new Date(2022, 11, 28, 17, 30),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 28, 18, 0),
    end: new Date(2022, 11, 28, 18, 40),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 28, 19, 0),
    end: new Date(2022, 11, 28, 21, 25),
  },

  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 28, 21, 30),
    end: new Date(2022, 11, 28, 22, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 28, 22, 0),
    end: new Date(2022, 11, 28, 23, 45),
  },
  {
    title: '🍱 Breakfast',
    start: new Date(2022, 11, 29, 7, 0),
    end: new Date(2022, 11, 29, 7, 40),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 29, 8, 0),
    end: new Date(2022, 11, 29, 8, 25),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 29, 8, 45),
    end: new Date(2022, 11, 29, 11, 45),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 29, 12, 0),
    end: new Date(2022, 11, 29, 12, 40),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 29, 13, 0),
    end: new Date(2022, 11, 29, 17, 30),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 29, 18, 0),
    end: new Date(2022, 11, 29, 18, 40),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 29, 19, 0),
    end: new Date(2022, 11, 29, 21, 30),
  },
  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 29, 21, 30),
    end: new Date(2022, 11, 29, 22, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 29, 22, 0),
    end: new Date(2022, 11, 29, 23, 45),
  },
  {
    title: '🍱 Breakfast',
    start: new Date(2022, 11, 30, 7, 0),
    end: new Date(2022, 11, 30, 7, 40),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 30, 8, 0),
    end: new Date(2022, 11, 30, 8, 25),
  },
  {
    title: '🖥️ Tuturuuu: Ability to create tasks on calendar and modify them',
    start: new Date(2022, 11, 30, 8, 45),
    end: new Date(2022, 11, 30, 11, 45),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 30, 12, 0),
    end: new Date(2022, 11, 30, 12, 40),
  },
  {
    title: '🖥️ Tuturuuu: Drag and drop support',
    start: new Date(2022, 11, 30, 13, 0),
    end: new Date(2022, 11, 30, 17, 30),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 30, 18, 0),
    end: new Date(2022, 11, 30, 18, 40),
  },
  {
    title: '🖥️ Tuturuuu: Drag and drop support',
    start: new Date(2022, 11, 30, 19, 0),
    end: new Date(2022, 11, 30, 21, 30),
  },
  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 30, 21, 30),
    end: new Date(2022, 11, 30, 22, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 30, 22, 0),
    end: new Date(2022, 11, 30, 23, 45),
  },
  {
    title: '🍱 Breakfast',
    start: new Date(2022, 11, 31, 7, 0),
    end: new Date(2022, 11, 31, 7, 40),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2022, 11, 31, 8, 0),
    end: new Date(2022, 11, 31, 8, 25),
  },
  {
    title: '🖥️ Tuturuuu: Drag and drop support',
    start: new Date(2022, 11, 31, 8, 45),
    end: new Date(2022, 11, 31, 11, 45),
  },
  {
    title: '🍱 Lunch',
    start: new Date(2022, 11, 31, 12, 0),
    end: new Date(2022, 11, 31, 12, 40),
  },
  {
    title: '🖥️ Tuturuuu: Drag and drop support',
    start: new Date(2022, 11, 31, 13, 0),
    end: new Date(2022, 11, 31, 17, 30),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2022, 11, 31, 18, 0),
    end: new Date(2022, 11, 31, 18, 40),
  },
  {
    title: '🖥️ Tuturuuu: Drag and drop support',
    start: new Date(2022, 11, 31, 19, 0),
    end: new Date(2022, 11, 31, 21, 30),
  },
  {
    title: '🤝 1:1 Meeting with Thu',
    start: new Date(2022, 11, 31, 21, 30),
    end: new Date(2022, 11, 31, 22, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2022, 11, 31, 22, 0),
    end: new Date(2022, 11, 31, 23, 45),
  },
  {
    title: '📨 Morning Catch Up',
    start: new Date(2023, 0, 1, 9, 30),
    end: new Date(2023, 0, 1, 10, 0),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2023, 0, 1, 10, 0),
    end: new Date(2023, 0, 1, 11, 30),
  },
  {
    title: '🍱 Brunch with Nhu',
    start: new Date(2023, 0, 1, 11, 30),
    end: new Date(2023, 0, 1, 12, 30),
  },
  {
    title: '📖 Reading',
    start: new Date(2023, 0, 1, 12, 45),
    end: new Date(2023, 0, 1, 16, 30),
  },
  {
    title: '🚲 Riding',
    start: new Date(2023, 0, 1, 16, 40),
    end: new Date(2023, 0, 1, 17, 50),
  },
  {
    title: '🍱 Dinner',
    start: new Date(2023, 0, 1, 18, 0),
    end: new Date(2023, 0, 1, 18, 40),
  },
  {
    title: '🎮 Entertainment',
    start: new Date(2023, 0, 1, 18, 45),
    end: new Date(2023, 0, 1, 23, 45),
  },
].map((task, idx) => ({
  id: idx,
  ...task,
}));

export default tasks;
