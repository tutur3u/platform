import type { Track } from '../../live/status.ts';

export const meetTrack: Track = {
  id: 'meet',
  name: 'Meet',
  summary:
    'Calmer calls with a proper waiting room, transcripts and notes, and faster loading.',
  milestones: [
    {
      id: 'meet-join',
      title: 'Joining and in-call experience',
      deliverables: [
        {
          id: 'meet-waiting-room',
          title: 'Pre-join waiting room with device controls and mic meter',
          prs: [7416, 7418, 7421],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-preparing',
          title: 'Minimal preparing screen with the Mira mark',
          prs: [7449, 7922],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-self-preview',
          title: 'Floating self-preview and calmer ended screen',
          prs: [7924],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-media-collab',
          title: 'Participants stay visible while collaborating',
          prs: [5935, 5918],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-personal-panel',
          title: 'Private tasks and calendar panel during calls',
          prs: [5816],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'meet-transcripts',
      title: 'Transcripts and notes',
      deliverables: [
        {
          id: 'meet-transcription-consent',
          title: 'Transcription with clear consent',
          prs: [7266],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-transcription-quality',
          title: 'Better transcription, including solo meetings',
          prs: [7267],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-notes-tabs',
          title: 'Notes and transcript tabs on the meeting page',
          prs: [7283],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-transcript-access',
          title: 'Transcripts visible only to participants and admins',
          prs: [7293, 7276],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-auto-notes',
          title: 'Auto-generated notes when a meeting ends',
          prs: [7285],
          app: 'meet',
          fallback: 'in_progress',
        },
        {
          id: 'meet-erase',
          title: 'Erase meeting transcripts on request',
          prs: [7522, 7523],
          app: 'meet',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'meet-coding',
      title: 'Coding rooms',
      deliverables: [
        {
          id: 'meet-blank-ide',
          title: 'Open a blank code editor in a meeting',
          prs: [5821],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-workbench',
          title: 'Compact coding workbench with full-height shared docs',
          prs: [6627],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'meet-speed',
      title: 'Faster Meet',
      deliverables: [
        {
          id: 'meet-first-load',
          title: 'Lighter first load and on-demand page chunks',
          prs: [6624, 7453],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-fewer-roundtrips',
          title: 'Rooms and workspaces open with fewer round trips',
          prs: [7445, 7455],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-edge',
          title: 'Meet on the new edge runtime',
          prs: [6350, 7447],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
  ],
};
