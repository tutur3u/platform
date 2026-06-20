export type PollOption =
  | {
      percentage: number;
      text: string;
      votes: number;
    }
  | {
      rank: number;
      text: string;
    };

export type MockPoll = {
  averageRating?: number;
  createdBy: string;
  endDate: Date;
  id: number;
  options: PollOption[];
  status: 'active' | 'completed' | 'draft';
  title: string;
  totalVotes: number;
  type: 'multiple-choice' | 'ranking' | 'rating' | 'yes-no';
};

export const mockPolls: MockPoll[] = [
  {
    createdBy: 'John Doe',
    endDate: new Date('2024-12-25'),
    id: 1,
    options: [
      { percentage: 33, text: 'Monday', votes: 8 },
      { percentage: 50, text: 'Tuesday', votes: 12 },
      { percentage: 17, text: 'Wednesday', votes: 4 },
    ],
    status: 'active',
    title: 'Which day should we schedule our team meeting?',
    totalVotes: 24,
    type: 'multiple-choice',
  },
  {
    createdBy: 'Jane Smith',
    endDate: new Date('2024-12-30'),
    id: 2,
    options: [
      { percentage: 78, text: 'Yes', votes: 14 },
      { percentage: 22, text: 'No', votes: 4 },
    ],
    status: 'active',
    title: 'Should we implement the new feature this sprint?',
    totalVotes: 18,
    type: 'yes-no',
  },
  {
    averageRating: 4.2,
    createdBy: 'Mike Johnson',
    endDate: new Date('2024-12-15'),
    id: 3,
    options: [
      { percentage: 44, text: '5 stars', votes: 20 },
      { percentage: 33, text: '4 stars', votes: 15 },
      { percentage: 16, text: '3 stars', votes: 7 },
      { percentage: 4, text: '2 stars', votes: 2 },
      { percentage: 3, text: '1 star', votes: 1 },
    ],
    status: 'completed',
    title: 'Rate our new office layout',
    totalVotes: 45,
    type: 'rating',
  },
  {
    createdBy: 'Sarah Wilson',
    endDate: new Date('2025-01-15'),
    id: 4,
    options: [
      { rank: 1, text: 'Jira' },
      { rank: 2, text: 'Trello' },
      { rank: 3, text: 'Asana' },
      { rank: 4, text: 'Monday.com' },
    ],
    status: 'draft',
    title: 'Rank your preferred project management tools',
    totalVotes: 0,
    type: 'ranking',
  },
];
