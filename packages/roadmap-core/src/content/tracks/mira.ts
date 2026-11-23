import type { Track } from '../../live/status.ts';

export const miraTrack: Track = {
  id: 'mira',
  name: 'Mira',
  summary:
    'Tuturuuu’s AI assistant: voice calls, memory, workspace tools, and more places to talk to it.',
  milestones: [
    {
      id: 'mira-live-memory',
      title: 'Mira Live, faster messages and memory on Cloudflare',
      titleVi: 'Mira Live, tin nhắn nhanh hơn và bộ nhớ trên Cloudflare',
      deliverables: [
        {
          id: 'mira-faster-messages',
          title:
            'Messages to Mira send instantly and replies start streaming sooner',
          titleVi: 'Tin nhắn gửi Mira đi ngay và câu trả lời hiện ra sớm hơn',
          prs: [8291, 8304],
          commits: [
            '240133125b1a5f4d7359b63f80ff8a2d62be7866',
            '07f42e4404418f542b3c7c8783e71da61abe166b',
            'c7812c477132d95326dcbb6216d64b6a6582a845',
          ],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'mira-live-plans',
          title:
            "Mira Live on paid plans, with a clear reason when a call can't start",
          titleVi:
            'Mira Live cho gói trả phí, nêu rõ lý do khi cuộc gọi không thể bắt đầu',
          prs: [],
          commits: ['fa2f018a1360bb9a63852f06f77296714e17c45f'],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'mira-live-orb',
          title: 'Mira Live explains call problems and shows an animated orb',
          titleVi:
            'Mira Live giải thích sự cố cuộc gọi và hiển thị quả cầu chuyển động',
          prs: [],
          commits: ['3b18afe0c65b682e844463f9c5aaefcde5446127'],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-mobile-chat',
          title:
            'Redesigned Mira chat on mobile with a new avatar and composer',
          titleVi:
            'Trò chuyện với Mira trên di động được thiết kế lại, có ảnh đại diện và khung soạn mới',
          prs: [],
          commits: [
            '4d47af28ff8ac1af38691dd4590e74dc8d60585e',
            '98a019b1b69b7ab2d352b036c3dd0a2b3f8740bc',
            'a417f3874010330e72526e1f2d2ba5b5ebeb8570',
          ],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-meet-consent',
          title:
            'Mira answers in Meet room chat only after every participant agrees',
          titleVi:
            'Mira chỉ trả lời trong khung chat phòng Meet khi mọi người tham gia đồng ý',
          prs: [],
          commits: [
            '56d2ca544fb18a5c7ae34f5f41fe1d1920a95ff3',
            'dcfff0605e69279b82adfd90033c615fc677e7a2',
          ],
          app: 'meet-realtime',
          fallback: 'planned',
        },
        {
          id: 'mira-owner-consent',
          title:
            'The meeting owner turns Mira on once, with a notice everyone sees',
          titleVi:
            'Chủ cuộc họp bật Mira một lần, kèm thông báo hiển thị cho mọi người',
          prs: [],
          app: 'meet-realtime',
          fallback: 'planned',
        },
        {
          id: 'mira-memory-cloudflare',
          title: 'Mira memory moving to a dedicated Cloudflare service',
          titleVi: 'Bộ nhớ của Mira đang chuyển sang dịch vụ Cloudflare riêng',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'mira-mobile',
      title: 'Mira on mobile',
      deliverables: [
        {
          id: 'mira-live-call',
          title: 'Full-screen Mira Live calls with one start button',
          prs: [6714, 6862],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-voice-dock',
          title: 'Record and send voice messages to Mira',
          prs: [5829, 7446],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-local-models',
          title: 'On-device models and private local chat',
          prs: [5870, 5914],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-onboarding',
          title: 'Branded Mira onboarding',
          prs: [5783],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-offline',
          title: 'Read Mira conversations offline',
          prs: [7470],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mira-memory',
      title: 'Memory and personality',
      deliverables: [
        {
          id: 'mira-personality',
          title: 'Manage Mira’s personality and memories',
          prs: [5963],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'mira-edit-memories',
          title: 'Edit saved memories with a review step',
          prs: [5969, 5976],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-rename',
          title: 'Rename Mira',
          prs: [5974],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'mira-themes',
          title: 'Themed message bubbles',
          prs: [6148, 6158],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mira-tools',
      title: 'Mira can do more',
      deliverables: [
        {
          id: 'mira-mail-tools',
          title: 'Read mail and draft replies',
          prs: [6659],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-health-tools',
          title: 'Log weight and habits, and get a day overview',
          prs: [6660],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-open-app',
          title: 'Open apps and use what is on screen',
          prs: [6662, 6664],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-first-reply',
          title: 'Faster first reply',
          prs: [6725],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-workspace-policy',
          title: 'Workspace-wide AI policy controls',
          prs: [7525],
          app: 'ai',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'mira-channels',
      title: 'Mira in more places',
      deliverables: [
        {
          id: 'mira-in-meet',
          title: 'Mira mark and avatar in Meet',
          prs: [7922, 7448],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'mira-discord',
          title: 'Mira in Discord servers linked to a workspace',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
        {
          id: 'mira-zalo',
          title: 'Mira in Zalo chats',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
