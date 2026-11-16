import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../../features/assistant/view/background_reply_harness.dart';
import '../store_screenshot_app.dart';
import 'store_team.dart';

const storeAssistantChatId = 'aaaaaaaa-0000-4000-8000-00000000c4a7';
const _actorId = '33333333-3333-4333-8333-333333333333';

/// Points the page at the stored launch-week conversation.
class StoreAssistantPreferences extends AssistantPreferences {
  StoreAssistantPreferences() : super(currentUserId: () => _actorId);

  @override
  Future<String?> loadChatId(String wsId) async => storeAssistantChatId;
}

/// Restores one finished conversation; nothing streams and nothing posts.
class StoreAssistantRepository extends ReplyRepository {
  StoreAssistantRepository(this.locale);

  final StoreLocale locale;

  static const _model = AssistantGatewayModel(
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
  );

  @override
  Future<List<AssistantGatewayModel>> fetchGatewayModels({
    bool forceRefresh = false,
  }) async => const [_model];

  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCredits(
    totalAllocated: 5000,
    totalUsed: 1240,
    remaining: 3760,
    tier: 'PRO',
  );

  @override
  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async => StoreTeam.workspaceId;

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(
      id: storeAssistantChatId,
      title: locale.pick("Today's priorities", 'Ưu tiên hôm nay'),
      model: _model.value,
      createdAt: StoreTeam.at(9, 12),
    ),
    messages: storeAssistantMessages(locale),
    attachmentsByMessageId: const {},
  );
}

AssistantMessagePart _text(String text) =>
    AssistantMessagePart(type: 'text', text: text);

AssistantMessagePart _tool(
  String id,
  String name,
  Map<String, dynamic> input,
  Object output,
) => AssistantMessagePart(
  type: 'dynamic-tool',
  toolName: name,
  toolCallId: id,
  state: 'output-available',
  input: input,
  output: output,
);

AssistantMessage _message(
  String id,
  String role,
  DateTime at,
  List<AssistantMessagePart> parts,
) => AssistantMessage(
  id: id,
  role: role,
  createdAt: at,
  parts: parts,
  isPersisted: true,
);

/// Linh asks what is urgent; Mira answers brief-first, then proposes one
/// concrete action and acts only after Linh agrees.
List<AssistantMessage> storeAssistantMessages(StoreLocale l) {
  final illustrations = l.pick(
    'Review onboarding illustrations',
    'Duyệt bộ minh hoạ màn hình chào mừng',
  );
  final copy = l.pick(
    'Finalize the launch page copy',
    'Chốt nội dung trang ra mắt',
  );
  final moodboard = l.pick(
    'Send the moodboard to Chi for sign-off',
    'Gửi moodboard để Chi duyệt',
  );
  final block = l.pick('Illustration review', 'Duyệt minh hoạ');
  return [
    _message(
      'bbbbbbbb-0000-4000-8000-000000000001',
      'user',
      StoreTeam.at(9, 12),
      [_text(l.pick("What's urgent today?", 'Hôm nay có việc gì gấp không?'))],
    ),
    _message(
      'bbbbbbbb-0000-4000-8000-000000000002',
      'assistant',
      StoreTeam.at(9, 12),
      [
        _tool(
          'call-tasks',
          'get_my_tasks',
          const {'scope': 'today'},
          {
            'tasks': [
              {'name': moodboard, 'overdue': true},
              {'name': illustrations, 'due': '15:00'},
              {'name': copy, 'due': '18:00'},
            ],
          },
        ),
        _tool(
          'call-events',
          'get_upcoming_events',
          const {'days': 1},
          {
            'events': [
              {'title': l.pick('Team stand-up', 'Họp nhanh đầu ngày')},
              {'title': l.pick('Lunch with Minh', 'Ăn trưa với Minh')},
            ],
          },
        ),
        _text(
          l.pick(
            'Three things need you today:\n\n'
                '1. **$moodboard**: overdue since yesterday.\n'
                '2. **$illustrations**: due 3:00 PM, An is waiting on '
                'your notes.\n'
                '3. **$copy**: due 6:00 PM, it unblocks '
                "Bao's upload.\n\n"
                "You're free from 1:00 to 2:30 PM. Want me to block it "
                'for the illustration review?',
            'Hôm nay có ba việc cần bạn:\n\n'
                '1. **$moodboard**: đã trễ từ hôm qua.\n'
                '2. **$illustrations**: hạn 15:00, An đang chờ góp ý '
                'của bạn.\n'
                '3. **$copy**: hạn 18:00, xong thì Bảo mới tải lên '
                'được.\n\n'
                'Bạn đang trống từ 13:00 đến 14:30. Mình đặt lịch '
                'khung đó để duyệt minh hoạ nhé?',
          ),
        ),
      ],
    ),
    _message(
      'bbbbbbbb-0000-4000-8000-000000000003',
      'user',
      StoreTeam.at(9, 14),
      [_text(l.pick('Yes, block it.', 'Ừ, đặt giúp mình.'))],
    ),
    _message(
      'bbbbbbbb-0000-4000-8000-000000000004',
      'assistant',
      StoreTeam.at(9, 14),
      [
        _tool(
          'call-create-event',
          'create_event',
          {'title': block, 'start': '13:00', 'end': '14:30'},
          {'message': l.pick('Event created', 'Đã tạo sự kiện')},
        ),
        _text(
          l.pick(
            'Done: **$block** is on your calendar, 1:00 to 2:30 PM. '
                'Should I also remind Chi about the moodboard?',
            'Xong: **$block** đã có trong lịch, 13:00 đến 14:30. '
                'Mình nhắc Chi về moodboard luôn nhé?',
          ),
        ),
      ],
    ),
  ];
}
