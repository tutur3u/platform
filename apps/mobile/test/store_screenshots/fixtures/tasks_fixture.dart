import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_boards_page.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/task_repository.dart';

import '../store_screenshot_app.dart';
import 'store_team.dart';

/// The launch board: four lists of the team's launch-week work.
abstract final class StoreTasksFixture {
  // Board and list ids carry the locale. The board cubit keeps its last
  // loaded lists in the app cache under these ids, so shared ids would show
  // one locale's tasks in the other's capture.
  static String boardId(StoreLocale l) => 'store-board-launch-${l.name}';

  static String listId(StoreLocale l, String key) =>
      'store-list-$key-${l.name}';

  static String boardName(StoreLocale l) => StoreTeam.project(l);

  static List<TaskBoardList> lists(StoreLocale l) => [
    TaskBoardList(
      id: listId(l, 'todo'),
      boardId: boardId(l),
      name: l.pick('To do', 'Cần làm'),
      status: 'not_started',
      color: 'GRAY',
      position: 0,
    ),
    TaskBoardList(
      id: listId(l, 'doing'),
      boardId: boardId(l),
      name: l.pick('In progress', 'Đang làm'),
      status: 'active',
      color: 'BLUE',
      position: 1,
    ),
    TaskBoardList(
      id: listId(l, 'review'),
      boardId: boardId(l),
      name: l.pick('Review', 'Đang duyệt'),
      status: 'review',
      color: 'PURPLE',
      position: 2,
    ),
    TaskBoardList(
      id: listId(l, 'done'),
      boardId: boardId(l),
      name: l.pick('Done', 'Hoàn thành'),
      status: 'done',
      color: 'GREEN',
      position: 3,
    ),
  ];

  static List<TaskLabel> labels(StoreLocale l) => [
    TaskLabel(
      id: 'store-label-design',
      wsId: StoreTeam.workspaceId,
      name: l.pick('Design', 'Thiết kế'),
      color: '#EC4899',
    ),
    const TaskLabel(
      id: 'store-label-web',
      wsId: StoreTeam.workspaceId,
      name: 'Web',
      color: '#3B82F6',
    ),
    TaskLabel(
      id: 'store-label-marketing',
      wsId: StoreTeam.workspaceId,
      name: l.pick('Marketing', 'Tiếp thị'),
      color: '#F59E0B',
    ),
    const TaskLabel(
      id: 'store-label-qa',
      wsId: StoreTeam.workspaceId,
      name: 'QA',
      color: '#10B981',
    ),
    TaskLabel(
      id: 'store-label-copy',
      wsId: StoreTeam.workspaceId,
      name: l.pick('Copy', 'Nội dung'),
      color: '#8B5CF6',
    ),
  ];

  static final List<WorkspaceUserOption> members = [
    for (final person in StoreTeam.members)
      WorkspaceUserOption(
        id: person.id,
        displayName: person.name,
        fullName: person.name,
        email: person.email,
      ),
  ];

  static TaskBoardTask _task(
    StoreLocale l, {
    required String id,
    required int number,
    required String listId,
    required String name,
    String? priority,
    List<String> labelIds = const [],
    List<StorePerson> people = const [],
    DateTime? due,
    int? points,
    bool? completed,
  }) {
    final byId = {for (final label in labels(l)) label.id: label};
    return TaskBoardTask(
      id: id,
      listId: listId,
      displayNumber: number,
      name: name,
      priority: priority,
      completed: completed,
      endDate: due,
      createdAt: StoreTeam.at(9, 0, -6),
      completedAt: completed == true ? StoreTeam.at(16, 30, -1) : null,
      estimationPoints: points,
      labelIds: labelIds,
      labels: [
        for (final labelId in labelIds)
          TaskBoardTaskLabel(
            id: labelId,
            name: byId[labelId]!.name,
            color: byId[labelId]!.color,
          ),
      ],
      assigneeIds: [for (final p in people) p.id],
      assignees: [
        for (final p in people)
          TaskBoardTaskAssignee(id: p.id, displayName: p.name, email: p.email),
      ],
    );
  }

  static List<TaskBoardTask> tasks(StoreLocale l) => [
    // To do
    _task(
      l,
      id: 'store-task-press',
      number: 42,
      listId: listId(l, 'todo'),
      name: l.pick('Draft the press kit', 'Soạn bộ tài liệu báo chí'),
      priority: 'high',
      labelIds: ['store-label-marketing', 'store-label-copy'],
      people: [StoreTeam.chi],
      due: StoreTeam.at(17, 0, 2),
      points: 3,
    ),
    _task(
      l,
      id: 'store-task-onboarding',
      number: 43,
      listId: listId(l, 'todo'),
      name: l.pick(
        'Record the onboarding walkthrough',
        'Quay video hướng dẫn làm quen',
      ),
      priority: 'normal',
      labelIds: ['store-label-marketing'],
      people: [StoreTeam.an, StoreTeam.me],
      due: StoreTeam.at(12, 0, 3),
      points: 2,
    ),
    _task(
      l,
      id: 'store-task-faq',
      number: 44,
      listId: listId(l, 'todo'),
      name: l.pick('Update the help center FAQ', 'Cập nhật mục hỏi đáp'),
      priority: 'low',
      labelIds: ['store-label-copy'],
      people: [StoreTeam.bao],
      due: StoreTeam.at(18, 0, 4),
      points: 1,
    ),
    _task(
      l,
      id: 'store-task-social',
      number: 45,
      listId: listId(l, 'todo'),
      name: l.pick(
        'Schedule launch-day social posts',
        'Lên lịch bài đăng ngày ra mắt',
      ),
      priority: 'normal',
      labelIds: ['store-label-marketing'],
      people: [StoreTeam.chi, StoreTeam.an],
      due: StoreTeam.at(9, 0, 5),
      points: 2,
    ),
    _task(
      l,
      id: 'store-task-smoke',
      number: 46,
      listId: listId(l, 'todo'),
      name: l.pick(
        'Launch-day smoke test checklist',
        'Danh sách kiểm thử ngày ra mắt',
      ),
      priority: 'high',
      labelIds: ['store-label-qa', 'store-label-web'],
      people: [StoreTeam.bao],
      due: StoreTeam.at(15, 0, 4),
      points: 3,
    ),
    _task(
      l,
      id: 'store-task-stickers',
      number: 47,
      listId: listId(l, 'todo'),
      name: l.pick('Order launch party stickers', 'Đặt in sticker tiệc ra mắt'),
      priority: 'low',
      labelIds: ['store-label-design'],
      people: [StoreTeam.me],
      due: StoreTeam.at(10, 0, 6),
      points: 1,
    ),
    // In progress
    _task(
      l,
      id: 'store-task-landing',
      number: 38,
      listId: listId(l, 'doing'),
      name: l.pick(
        'Build the launch landing page',
        'Dựng trang giới thiệu ra mắt',
      ),
      priority: 'critical',
      labelIds: ['store-label-web', 'store-label-design'],
      people: [StoreTeam.minh, StoreTeam.me],
      due: StoreTeam.at(17, 0, 1),
      points: 5,
    ),
    _task(
      l,
      id: 'store-task-hero',
      number: 39,
      listId: listId(l, 'doing'),
      name: l.pick('Final hero illustrations', 'Hoàn thiện minh họa ảnh bìa'),
      priority: 'high',
      labelIds: ['store-label-design'],
      people: [StoreTeam.an],
      due: StoreTeam.at(15),
      points: 3,
    ),
    _task(
      l,
      id: 'store-task-newsletter',
      number: 40,
      listId: listId(l, 'doing'),
      name: l.pick('Write the launch newsletter', 'Viết bản tin ra mắt'),
      priority: 'normal',
      labelIds: ['store-label-copy', 'store-label-marketing'],
      people: [StoreTeam.chi],
      due: StoreTeam.at(10, 0, 2),
      points: 2,
    ),
    _task(
      l,
      id: 'store-task-emails',
      number: 41,
      listId: listId(l, 'doing'),
      name: l.pick('Design the welcome emails', 'Thiết kế email chào mừng'),
      priority: 'normal',
      labelIds: ['store-label-design', 'store-label-copy'],
      people: [StoreTeam.an, StoreTeam.chi],
      due: StoreTeam.at(17, 0, 3),
      points: 2,
    ),
    // Review
    _task(
      l,
      id: 'store-task-pricing',
      number: 35,
      listId: listId(l, 'review'),
      name: l.pick('Pricing page copy', 'Nội dung trang bảng giá'),
      priority: 'high',
      labelIds: ['store-label-copy', 'store-label-web'],
      people: [StoreTeam.bao, StoreTeam.chi],
      due: StoreTeam.at(11),
      points: 2,
    ),
    _task(
      l,
      id: 'store-task-a11y',
      number: 36,
      listId: listId(l, 'review'),
      name: l.pick(
        'Accessibility pass on signup',
        'Rà soát trợ năng luồng đăng ký',
      ),
      priority: 'normal',
      labelIds: ['store-label-qa'],
      people: [StoreTeam.minh],
      due: StoreTeam.at(16, 0, 1),
      points: 3,
    ),
    _task(
      l,
      id: 'store-task-og',
      number: 37,
      listId: listId(l, 'review'),
      name: l.pick('Social preview images', 'Ảnh xem trước khi chia sẻ'),
      priority: 'low',
      labelIds: ['store-label-design', 'store-label-web'],
      people: [StoreTeam.an],
      due: StoreTeam.at(12, 0, 2),
      points: 1,
    ),
    // Done
    _task(
      l,
      id: 'store-task-brand',
      number: 30,
      listId: listId(l, 'done'),
      name: l.pick('Refresh the brand palette', 'Làm mới bảng màu thương hiệu'),
      priority: 'normal',
      labelIds: ['store-label-design'],
      people: [StoreTeam.an],
      due: StoreTeam.at(17, 0, -2),
      points: 2,
      completed: true,
    ),
    _task(
      l,
      id: 'store-task-analytics',
      number: 31,
      listId: listId(l, 'done'),
      name: l.pick('Set up launch analytics', 'Thiết lập số liệu ra mắt'),
      priority: 'low',
      labelIds: ['store-label-web'],
      people: [StoreTeam.minh],
      due: StoreTeam.at(12, 0, -1),
      points: 1,
      completed: true,
    ),
    _task(
      l,
      id: 'store-task-qa',
      number: 32,
      listId: listId(l, 'done'),
      name: l.pick('Regression test checkout', 'Kiểm thử lại luồng thanh toán'),
      priority: 'high',
      labelIds: ['store-label-qa'],
      people: [StoreTeam.bao],
      due: StoreTeam.at(18, 0, -1),
      points: 3,
      completed: true,
    ),
  ];

  static TaskBoardDetail detail(StoreLocale l) => TaskBoardDetail(
    id: boardId(l),
    wsId: StoreTeam.workspaceId,
    name: boardName(l),
    ticketPrefix: 'SPR',
    createdAt: StoreTeam.at(9, 0, -14),
    estimationType: 'fibonacci',
    lists: lists(l),
    tasks: tasks(l),
    labels: labels(l),
    members: members,
  );
}

/// Serves the launch board; writes are accepted and ignored.
class StoreTaskRepository extends TaskRepository {
  StoreTaskRepository(this.locale);

  final StoreLocale locale;

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async => StoreTasksFixture.detail(locale);

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    if (offset > 0) return const <TaskBoardTask>[];
    return StoreTasksFixture.tasks(
      locale,
    ).where((task) => task.listId == listId).toList(growable: false);
  }

  @override
  Future<TaskBoardsPage> getTaskBoards(
    String wsId, {
    int page = 1,
    int pageSize = 20,
    String status = 'all',
  }) async =>
      const TaskBoardsPage(boards: [], totalCount: 0, page: 1, pageSize: 20);
}
