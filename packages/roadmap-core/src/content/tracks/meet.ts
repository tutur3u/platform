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
        {
          id: 'meet-guest-join',
          title: 'Guests join a class from a link without signing in',
          titleVi: 'Khách vào lớp bằng đường dẫn mà không cần đăng nhập',
          prs: [],
          app: 'meet',
          fallback: 'in_progress',
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
        {
          id: 'meet-action-items-roundtrip',
          title:
            'Meeting action items saved to a linked task board, with status back',
          titleVi:
            'Việc cần làm từ cuộc họp được lưu vào bảng công việc liên kết, kèm trạng thái',
          prs: [],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'meet-records',
      title: 'Meeting records and follow-ups',
      titleVi: 'Biên bản cuộc họp và việc cần làm tiếp theo',
      summary: 'Every meeting keeps a record that links its notes and tasks.',
      deliverables: [
        {
          id: 'meet-record-review',
          title: 'A meeting record with every action item saved in one review',
          titleVi:
            'Biên bản cuộc họp, lưu mọi việc cần làm chỉ trong một lần xem lại',
          prs: [],
          commits: [
            '7a9e435cbdd186a16e42d1a246975eceb0198c24',
            '4fb968c8158ea9df9304f871d8e893a6364d39bf',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-project-links',
          title:
            'Meetings linked to Projects, showing what changed since the last one',
          titleVi:
            'Cuộc họp gắn với Dự án, cho thấy điều gì đã thay đổi kể từ lần trước',
          prs: [],
          commits: [
            '138f8bc9750351fda832ce5df0dcd5e1f1246366',
            '8c74da1bbb873188cf2aaaef37e6194c58a55147',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-live-notes',
          title: 'Live transcript and notes panel, on for every workspace',
          titleVi:
            'Bảng ghi chép và bản ghi lời nói trực tiếp, bật cho mọi không gian làm việc',
          prs: [],
          commits: [
            '580deca552d119bec3ffb02c5afd2b6f53265e14',
            '42eddfa6a40f10f5affb7558fe6d244f135c40d6',
            '134724e6dfc362c1556008c5efc05296719d7845',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-per-speaker',
          title: "Per-speaker transcripts from each participant's microphone",
          titleVi:
            'Bản ghi theo từng người nói, từ micro của mỗi người tham gia',
          prs: [],
          app: 'meet',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'meet-mira',
      title: 'Mira and the assistant in calls',
      titleVi: 'Mira và trợ lý trong cuộc gọi',
      deliverables: [
        {
          id: 'meet-room-mira',
          title:
            "Mira in the room, with host acceptance and each person's choice at join",
          titleVi:
            'Mira trong phòng họp, cần chủ phòng chấp nhận và mỗi người tự chọn khi tham gia',
          prs: [],
          commits: [
            'a069e1a1f9d5f01d3520cffaf9e552d15970ff9a',
            '110f4aae17df7d362b6320368ddf77f729e24a77',
            'e766123e4985258a1a82c15a408fa14df3413783',
            'd532d5be5ce93df8fa7810bd578fe789cd3e6b47',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-private-assistant-chat',
          title: 'The Private Assistant rebuilt as a minimal chat',
          titleVi: 'Trợ lý riêng được làm lại thành khung trò chuyện tối giản',
          prs: [],
          commits: ['3c78eb72a4e9713fb28dd83237928df212dcd1d5'],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'meet-activities',
      title: 'Activities and whiteboards',
      titleVi: 'Hoạt động và bảng trắng',
      deliverables: [
        {
          id: 'meet-activity-stage',
          title:
            'Polls, timer, quiz and pen board in one resizable activity stage',
          titleVi:
            'Bình chọn, hẹn giờ, câu đố và bảng vẽ trong một khu hoạt động có thể đổi kích thước',
          prs: [],
          commits: [
            'db58df1bc09bc61990744f47cee678c756c3cf9f',
            '74de0f0418f3b1b0f0899a7cf4d07f513437a020',
            '7a4fabbb240793c6a4fd1b72e7921a7bb9c71fd2',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-whiteboards',
          title: 'Persistent whiteboards you can reopen after the call',
          titleVi: 'Bảng trắng được lưu lại, mở lại được sau cuộc gọi',
          prs: [],
          commits: [
            '7eaea244c78042cc0cd41ce85aeda32a78b04877',
            '9e33f9146660edb6703248e46665145e5ec45d75',
            'a1af5d9204e4ed6ab6933df4f22eb23f6aed791f',
            '6499a524622244cf2f4058574650f2340655c492',
            'e081543240ee19831a08c3750bd41274ef30cd8a',
          ],
          app: 'meet',
          fallback: 'planned',
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
    {
      id: 'meet-classroom',
      title: 'Classroom',
      summary: 'Meet as a classroom for Learn and Teach, built in stages.',
      deliverables: [
        {
          // #8141 is merged, but its flag stays off in production until main
          // is green. Add [8141] back once the flag is reported on, so this
          // never reads as live early.
          id: 'meet-classroom-caps',
          title: 'Class size caps and host admission',
          prs: [],
          app: 'meet',
          fallback: 'in_progress',
        },
        {
          id: 'meet-classroom-roles',
          title: 'Teachers and teaching assistants in one room',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-share',
          title: 'Share documents, slides, PDFs and YouTube in class',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-quizzes',
          title: 'Quizzes, assignments and a class timer',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-upskii-presenter',
          title: 'Present an Upskii lesson or quiz inside Meet',
          titleVi:
            'Trình chiếu bài học hoặc bài kiểm tra Upskii ngay trong Meet',
          prs: [],
          commits: [
            '0a9ae7a8e6facb95c13182c2766a06d75544957f',
            'd6745942c2337f3603c6aacaf5c1f54adea91d84',
            '66fd7101b273f2dee8c5fc04b641d1e6b5c85ea1',
          ],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'meet-follow-me',
          title: 'Follow me: the class sees what the presenter shows',
          titleVi:
            'Theo dõi tôi: cả lớp cùng xem nội dung người trình bày đang mở',
          prs: [],
          app: 'meet',
          fallback: 'in_progress',
        },
        {
          id: 'meet-live-qa',
          title: 'Live Q&A: the class asks and upvotes questions',
          titleVi: 'Hỏi đáp trực tiếp: cả lớp đặt câu hỏi và bình chọn',
          prs: [],
          commits: ['325288632f41971d50273368a61c0750076295cc'],
          app: 'meet',
          fallback: 'in_progress',
        },
        {
          id: 'meet-classroom-points',
          title: 'Plus points for participation',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-ai-levels',
          title: 'Teacher-chosen AI help: off, hints only, or full',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-captions',
          title: 'Live captions and class insights',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-integrity',
          title: 'Integrity controls with a notice to students',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-drawing',
          title: 'Handwriting and drawings to text and LaTeX',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'meet-classroom-notebooks',
          title: 'Class notebooks linked to tasks and calendar',
          prs: [],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
