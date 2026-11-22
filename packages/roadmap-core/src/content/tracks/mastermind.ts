import type { Track } from '../../live/status.ts';

export const mastermindTrack: Track = {
  id: 'mastermind',
  name: 'Mastermind',
  summary:
    'Decisions, a daily catch-up and insight charts for the Tuturuuu team, on mobile and the web.',
  milestones: [
    {
      id: 'mastermind-v3',
      title: 'Mastermind v3: projects, shipping and usage',
      titleVi: 'Mastermind v3: dự án, phát hành và mức sử dụng',
      deliverables: [
        {
          id: 'mm-inbox-v3',
          title: 'Rebuilt Inbox and Today with live updates on web and mobile',
          titleVi:
            'Inbox và Today được làm lại, cập nhật trực tiếp trên web và di động',
          prs: [],
          commits: [
            'd83e840ab28f351d5ade4adf66079e6c51397885',
            'ffd948bf080d37011e84fc9c216eb5e2e148bcd9',
            '250ca4511c9993b9e2de83d607fca068d919be30',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-steer',
          title: 'Reply into a running thread to steer it instead of queueing',
          titleVi:
            'Trả lời vào luồng đang chạy để điều hướng ngay thay vì xếp hàng chờ',
          prs: [],
          commits: [
            '497bfb470c4fc3c988f891c555fa10da87c176d8',
            '80418170c76220fdc3cade3e9c2cc87e00f95dc2',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-projects',
          title: 'Projects view that groups work by project, with filters',
          titleVi: 'Chế độ xem Dự án nhóm công việc theo dự án, kèm bộ lọc',
          prs: [],
          commits: [
            '631edf3ca8287328e108a1167ba13b190a0bf94f',
            'c52c4fd3a1f2db04d38fc8cca86f0a5f8d31689d',
            '2a571b7c42109775e585b7b208b9f86df8ba833b',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-ship',
          title: 'Ship screen showing what is live in production and staging',
          titleVi:
            'Màn hình Ship cho thấy những gì đang chạy ở production và staging',
          prs: [],
          commits: [
            '6d646939d7ca6a68b0880cc47ea95db1195f52cf',
            '1e7499f85928df4d856053b7a8af79dac3dc456e',
            '7bd1c597ed0737ea005aa9ac3ecef0bfc8f366e9',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-usage',
          title: 'Usage report with daily outcome summaries',
          titleVi: 'Báo cáo mức sử dụng kèm tóm tắt kết quả mỗi ngày',
          prs: [],
          commits: [
            '14ddab23bb214baae0cd61e9516167cfa2f6a9c9',
            'f7c2d0f614e3782f79757bf10b80a59a129d3d2b',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-own-host',
          title: 'Mastermind web on its own address with Tuturuuu sign-in',
          titleVi:
            'Mastermind web có địa chỉ riêng và đăng nhập bằng tài khoản Tuturuuu',
          prs: [],
          commits: [
            'c7a3a4f389c3ec775ca13bc23ce82600d0a82a63',
            '6c92da2aaea25c88cb015531c1cdb2296cb7afb2',
            'e682366fc714fcbadf7a5a2739048fbd93247fb1',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-access-requests',
          title: 'Request Mastermind access from web and mobile',
          titleVi: 'Yêu cầu quyền truy cập Mastermind từ web và di động',
          prs: [],
          commits: [
            'ab669541d2d6561706f8f81a63a4346eb535f4b3',
            '7de17d8566135aa68b82cfcc6413ba8cd64d3cbb',
            '85c21a8e85981af544f45f52ecb5c463971809a9',
          ],
          app: 'mastermind',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mastermind-mobile',
      title: 'Mastermind on mobile',
      deliverables: [
        {
          id: 'mm-home-catchup',
          title: 'Home with a catch-up section for today',
          prs: [7176, 7213],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-decisions',
          title: 'Answer decisions from Home and Inbox',
          prs: [7205, 7218],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-inbox-tiers',
          title: 'Inbox grouped by priority with search',
          prs: [7412, 7425],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-undo',
          title: 'Undo window before replies are sent',
          prs: [7414, 7459],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-charts',
          title: 'Accessible insight charts',
          prs: [7040],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-offline',
          title: 'Read the latest overview offline',
          prs: [7468],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mastermind-web',
      title: 'Mastermind on the web',
      deliverables: [
        {
          id: 'mm-web-app',
          title: 'Private Mastermind web app',
          prs: [7301],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-access',
          title: 'Access only with an explicit permission',
          prs: [7158],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-ask-cards',
          title: 'Inbox ask cards on the web',
          prs: [7390, 7395],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-schedules',
          title: 'Scheduled occurrences',
          prs: [7911],
          app: 'mastermind',
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
