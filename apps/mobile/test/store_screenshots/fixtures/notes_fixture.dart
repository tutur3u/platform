import 'package:mobile/features/notes/note_repository.dart';

import '../store_screenshot_app.dart';
import 'store_team.dart';

/// Notes the studio keeps during launch week, as the notes API returns them
/// (TipTap documents with task and event mentions).
abstract final class StoreNotes {
  static const reviewId = 'store-note-design-review';

  static String reviewTitle(StoreLocale l) =>
      l.pick('Design review recap', 'Tổng kết buổi review thiết kế');

  static List<NoteRecord> inbox(StoreLocale l) => [
    _note(reviewId, reviewTitle(l), StoreTeam.at(10, 40), _review(l)),
    _note(
      'store-note-moodboard',
      l.pick('Moodboard brief', 'Brief moodboard'),
      StoreTeam.at(9, 15),
      _doc([
        _p(
          l.pick(
            'Warm sorbet tones, soft grain, hand-drawn type for headlines. '
                'Photos feel like late-afternoon light in the studio.',
            'Tông màu sorbet ấm, chút nhiễu hạt nhẹ, chữ tiêu đề vẽ tay. '
                'Ảnh mang cảm giác nắng chiều trong studio.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-standup',
      l.pick('Standup notes', 'Ghi chú họp nhanh'),
      StoreTeam.at(8, 45),
      _doc([
        _p(
          l.pick(
            'Minh wraps up pricing QA, An polishes the welcome '
                'illustrations, Bao drafts press quotes.',
            'Minh hoàn tất kiểm thử bảng giá, An chỉnh minh hoạ chào mừng, '
                'Bảo soạn trích dẫn báo chí.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-beta',
      l.pick('Beta feedback, round two', 'Phản hồi beta, vòng hai'),
      StoreTeam.at(15, 10, -1),
      _doc([
        _p(
          l.pick(
            'Testers love the Today view. Two asked for a home screen widget.',
            'Người dùng thử rất thích màn hình Hôm nay. Hai người muốn có '
                'widget ngoài màn hình chính.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-checklist',
      l.pick('Launch day checklist', 'Checklist ngày ra mắt'),
      StoreTeam.at(18, 20, -1),
      _doc([
        _tasks([
          (true, l.pick('Freeze the release build', 'Khoá bản phát hành')),
          (false, l.pick('Schedule the newsletter', 'Hẹn giờ gửi bản tin')),
          (false, l.pick('Post the teaser video', 'Đăng video teaser')),
        ]),
      ]),
    ),
    _note(
      'store-note-landing',
      l.pick('Landing page copy ideas', 'Ý tưởng nội dung trang giới thiệu'),
      StoreTeam.at(16, 5, -2),
      _doc([
        _p(
          l.pick(
            '"Plan the week, not just the day." Lead with the calendar '
                'and tasks living side by side.',
            '"Lên kế hoạch cho cả tuần, không chỉ một ngày." Mở đầu bằng '
                'lịch và công việc nằm cạnh nhau.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-interviews',
      l.pick(
        'Customer interviews: café owners',
        'Phỏng vấn khách hàng: chủ quán cà phê',
      ),
      StoreTeam.at(11, 30, -3),
      _doc([
        _p(
          l.pick(
            'Three of five track shifts on paper. All want reminders '
                'that reach the whole team.',
            'Ba trên năm người vẫn ghi ca làm trên giấy. Ai cũng cần '
                'nhắc việc tới cả nhóm.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-shots',
      l.pick('Product photo shot list', 'Danh sách cảnh chụp sản phẩm'),
      StoreTeam.at(13, 20, -4),
      _doc([
        _p(
          l.pick(
            'Flat lay on linen, phone in hand at the café counter, '
                'team at the planning wall.',
            'Bày phẳng trên vải lanh, cầm điện thoại ở quầy cà phê, '
                'cả nhóm bên bảng kế hoạch.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-sync',
      l.pick('Weekly sync: Minh, An, Bao', 'Họp tuần: Minh, An, Bảo'),
      StoreTeam.at(9, 0, -5),
      _doc([
        _p(
          l.pick(
            'Pricing page moves to review on Thursday. Bao owns the press kit.',
            'Trang bảng giá chuyển sang duyệt vào thứ Năm. Bảo phụ trách '
                'bộ tài liệu báo chí.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-tokens',
      l.pick('Color tokens v2', 'Bộ token màu v2'),
      StoreTeam.at(14, 0, -12),
      _doc([
        _p(
          l.pick(
            'Peach, mint and lilac accents on a cream surface. '
                'Contrast checked for every text pair.',
            'Điểm nhấn đào, bạc hà và tím nhạt trên nền kem. '
                'Đã kiểm tra độ tương phản cho mọi cặp chữ.',
          ),
        ),
      ]),
    ),
    _note(
      'store-note-retro',
      l.pick('Retro: winter campaign', 'Nhìn lại chiến dịch mùa đông'),
      StoreTeam.at(15, 0, -41),
      _doc([
        _p(
          l.pick(
            'Short videos beat static posts two to one. Start assets earlier.',
            'Video ngắn hiệu quả gấp đôi bài đăng ảnh tĩnh. Cần chuẩn bị '
                'nội dung sớm hơn.',
          ),
        ),
      ]),
    ),
  ];

  static Map<String, dynamic> _review(StoreLocale l) => _doc([
    _p(
      l.pick(
        'Minh, An, Chi and I walked through the launch visuals. The '
            'direction is approved; two screens need another pass.',
        'Minh, An, Chi và mình đã xem lại toàn bộ hình ảnh ra mắt. Hướng '
            'thiết kế đã được duyệt, còn hai màn hình cần chỉnh thêm.',
      ),
    ),
    _h(l.pick('Decisions', 'Quyết định')),
    _bullets([
      l.pick(
        'Hero illustration uses the warm sorbet palette',
        'Minh hoạ chính dùng bảng màu sorbet ấm',
      ),
      l.pick(
        'Onboarding stays at three screens',
        'Màn hình chào mừng giữ ở ba bước',
      ),
      l.pick(
        'Dark mode screenshots ship in week two',
        'Ảnh chụp chế độ tối ra mắt vào tuần thứ hai',
      ),
    ]),
    _h(l.pick('Screens', 'Các màn hình')),
    _table([
      [
        l.pick('Screen', 'Màn hình'),
        l.pick('Owner', 'Phụ trách'),
        l.pick('Status', 'Trạng thái'),
      ],
      [
        l.pick('Welcome', 'Chào mừng'),
        StoreTeam.an.firstName,
        l.pick('Another pass', 'Chỉnh thêm'),
      ],
      [
        l.pick('Today view', 'Hôm nay'),
        StoreTeam.minh.firstName,
        l.pick('Approved', 'Đã duyệt'),
      ],
      [
        l.pick('Pricing', 'Bảng giá'),
        StoreTeam.chi.firstName,
        l.pick('Another pass', 'Chỉnh thêm'),
      ],
    ]),
    _h(l.pick('Follow-ups', 'Việc cần làm')),
    _taskList([
      (
        false,
        [
          _task(
            'store-task-illustrations',
            l.pick(
              'Review onboarding illustrations',
              'Duyệt bộ minh hoạ màn hình chào mừng',
            ),
          ),
          _t(' · ${StoreTeam.an.firstName}'),
        ],
      ),
      (
        false,
        [
          _task(
            'store-task-screenshots',
            l.pick(
              'Finalize the launch page copy',
              'Chốt nội dung trang ra mắt',
            ),
          ),
          _t(' · ${StoreTeam.me.firstName}'),
        ],
      ),
      (
        true,
        [
          _t(
            l.pick(
              'Export the icon set for every platform',
              'Xuất bộ icon cho mọi nền tảng',
            ),
          ),
        ],
      ),
      (
        false,
        [
          _task(
            'store-task-studio',
            l.pick(
              'Book the photo studio for product shots',
              'Đặt studio chụp ảnh sản phẩm',
            ),
          ),
          _t(' · ${l.pick('Bao', 'Bảo')}'),
        ],
      ),
    ]),
    _h(l.pick('Next review', 'Buổi review tiếp theo')),
    {
      'type': 'paragraph',
      'content': [
        _t(l.pick('Tomorrow, 9:30 · ', 'Ngày mai, 9:30 · ')),
        _mention(
          'store-event-review',
          'event',
          l.pick(
            'Design review: launch visuals',
            'Review thiết kế: hình ảnh ra mắt',
          ),
        ),
      ],
    },
  ]);

  static NoteRecord _note(
    String id,
    String title,
    DateTime updatedAt,
    Map<String, dynamic> content,
  ) => NoteRecord(
    id: id,
    title: title,
    content: content,
    updatedAt: updatedAt,
    archived: false,
  );

  static Map<String, dynamic> _doc(List<Map<String, dynamic>> nodes) => {
    'type': 'doc',
    'content': nodes,
  };

  static Map<String, dynamic> _t(String text) => {'type': 'text', 'text': text};

  static Map<String, dynamic> _p(String text) => {
    'type': 'paragraph',
    'content': [_t(text)],
  };

  static Map<String, dynamic> _h(String text) => {
    'type': 'heading',
    'attrs': {'level': 3},
    'content': [_t(text)],
  };

  static Map<String, dynamic> _table(List<List<String>> rows) => {
    'type': 'table',
    'content': [
      for (var row = 0; row < rows.length; row++)
        {
          'type': 'tableRow',
          'content': [
            for (final cell in rows[row])
              {
                'type': row == 0 ? 'tableHeader' : 'tableCell',
                'content': [_p(cell)],
              },
          ],
        },
    ],
  };

  static Map<String, dynamic> _bullets(List<String> items) => {
    'type': 'bulletList',
    'content': [
      for (final item in items)
        {
          'type': 'listItem',
          'content': [_p(item)],
        },
    ],
  };

  static Map<String, dynamic> _tasks(List<(bool, String)> items) => _taskList([
    for (final (checked, text) in items) (checked, [_t(text)]),
  ]);

  static Map<String, dynamic> _taskList(
    List<(bool, List<Map<String, dynamic>>)> items,
  ) => {
    'type': 'taskList',
    'content': [
      for (final (checked, inline) in items)
        {
          'type': 'taskItem',
          'attrs': {'checked': checked},
          'content': [
            {'type': 'paragraph', 'content': inline},
          ],
        },
    ],
  };

  static Map<String, dynamic> _task(String id, String name) =>
      _mention(id, 'task', name);

  static Map<String, dynamic> _mention(String id, String kind, String name) => {
    'type': 'mention',
    'attrs': {
      'entityId': id,
      'entityType': kind,
      'displayName': name,
      'workspaceId': StoreTeam.workspaceId,
    },
  };
}

/// Serves [StoreNotes] without the notes API; edits stay in memory.
class StoreNoteRepository extends NoteRepository {
  StoreNoteRepository(this.locale);

  final StoreLocale locale;

  @override
  Future<List<NoteRecord>> cached(String wsId, {bool archived = false}) async =>
      archived ? const [] : StoreNotes.inbox(locale);

  @override
  Future<List<NoteRecord>> refresh(String wsId, {bool archived = false}) =>
      cached(wsId, archived: archived);

  @override
  Future<NoteRecord> update(
    String wsId,
    NoteRecord note, {
    String? title,
    Map<String, dynamic>? content,
    bool? archived,
  }) async => NoteRecord(
    id: note.id,
    title: title ?? note.title,
    content: content ?? note.content,
    updatedAt: note.updatedAt,
    archived: archived ?? note.archived,
  );
}
