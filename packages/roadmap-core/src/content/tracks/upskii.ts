import type { Track } from '../../live/status.ts';

export const upskiiTrack: Track = {
  id: 'upskii',
  name: 'Upskii',
  summary:
    'Education tools across Upskii and Tuturuuu Learn, Teach and Rewise.',
  milestones: [
    {
      id: 'upskii-with-tuturuuu',
      title: 'Upskii with your Tuturuuu account',
      titleVi: 'Upskii cùng tài khoản Tuturuuu',
      deliverables: [
        {
          id: 'upskii-account-linking',
          title: 'Link your Upskii and Tuturuuu accounts',
          titleVi: 'Liên kết tài khoản Upskii với tài khoản Tuturuuu',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'upskii-integration-card',
          title: 'Upskii in the Integrations catalog',
          titleVi: 'Upskii trong danh mục Tích hợp',
          prs: [],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'learn-teach-together',
      title: 'Learn and Teach, together at tuturuuu.com',
      titleVi: 'Learn và Teach hợp nhất tại tuturuuu.com',
      deliverables: [
        {
          id: 'lms-switcher',
          title: 'Switch between Learn and Teach in one app',
          titleVi: 'Chuyển đổi giữa Learn và Teach ngay trong một ứng dụng',
          prs: [],
          commits: [
            'eca81f1b0553a144ba196fcdd09491ff84d29a1c',
            '0c69346605bd7877bcaf7cb0dce58e4b36818752',
          ],
          app: 'lms',
          fallback: 'planned',
        },
        {
          id: 'learn-home-rebuild',
          title: 'Rebuilt Learn home with course outlines, progress and resume',
          titleVi:
            'Trang Learn mới với dàn ý khóa học, tiến độ và nút học tiếp',
          prs: [],
          commits: [
            'dd0f55e501948b2eb801377689a7832db19ca4f4',
            '512d96625e8fa41908b4dc43619fb9001dae724d',
            '5397ca1df07cbca2a6371060e935f722733c2de7',
          ],
          app: 'learn',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'upskii-docs',
      title: 'Upskii in Tuturuuu',
      deliverables: [
        {
          id: 'upskii-overview',
          title: 'Upskii overview in the Tuturuuu docs',
          prs: [7351],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'learn-coding',
      title: 'Learn: coding lab',
      deliverables: [
        {
          id: 'learn-coding-lab',
          title: 'Multilingual coding lab',
          prs: [5609],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-coding-workspace',
          title: 'Resizable coding workspace with run history',
          prs: [5637, 5707],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-problem-catalog',
          title: 'Programming problem catalog with author forms',
          prs: [5709, 5710],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'learn-teach-shell',
      title: 'Learn and Teach upgrades',
      deliverables: [
        {
          id: 'learn-teach-shell',
          title: 'Learn and Teach share the new app shell',
          prs: [5533, 5567],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-teach-todo',
          title: 'Personal To do in Learn and Teach',
          prs: [5785],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-teach-edge',
          title: 'Learn and Teach on the new edge runtime',
          prs: [7961, 7943],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'rewise-url',
          title: 'Rewise lives at rewise.tuturuuu.com',
          prs: [7757],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
