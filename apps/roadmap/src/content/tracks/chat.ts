import type { Track } from '../../live/status.ts';

export const chatTrack: Track = {
  id: 'chat',
  name: 'Chat',
  summary:
    'Workspace messaging with dependable replies, media and offline reading.',
  milestones: [
    {
      id: 'chat-reliability',
      title: 'Dependable conversations',
      deliverables: [
        {
          id: 'chat-media-history',
          title: 'Earlier media and saved replies load reliably',
          prs: [5563],
          app: 'chat',
          fallback: 'planned',
        },
        {
          id: 'chat-stream-complete',
          title: 'Replies finish saving even if a stream is interrupted',
          prs: [5962, 5965],
          app: 'chat',
          fallback: 'planned',
        },
        {
          id: 'chat-clear-errors',
          title: 'Clearer error messages when a reply fails',
          prs: [6043],
          app: 'chat',
          fallback: 'planned',
        },
        {
          id: 'chat-unread-count',
          title: 'Correct unread counts for signed-in users',
          prs: [8071],
          app: 'chat',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'chat-mobile',
      title: 'Chat on mobile',
      deliverables: [
        {
          id: 'chat-mobile-media',
          title: 'Preview photos and files in mobile Chat',
          prs: [5553],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'chat-mobile-scroll',
          title: 'Conversations open at the latest message',
          prs: [5838],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'chat-mobile-actions',
          title: 'Message actions and chat appearance options',
          prs: [6649],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'chat-offline-read',
          title: 'Read recent Chat conversations offline',
          prs: [7464],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'chat-runtime',
      title: 'Faster Chat hosting',
      summary: 'Chat moves to a faster edge runtime.',
      deliverables: [
        {
          id: 'chat-edge-source',
          title: 'Chat built for the new edge runtime',
          prs: [7962, 7996],
          app: 'chat',
          fallback: 'planned',
        },
        {
          id: 'chat-edge-cutover',
          title: 'Switch Chat over to the new runtime',
          prs: [7613, 7616],
          app: 'chat',
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
