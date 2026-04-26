import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';

void main() {
  group('resolveMobileDeepLink', () {
    test('maps canonical web task links to mobile task detail route', () {
      final link = resolveMobileDeepLink(
        Uri.parse(
          'https://tuturuuu.com/en/personal/tasks/boards/board-1?task=task-1',
        ),
      );

      expect(link, isNotNull);
      expect(link!.workspaceSlug, 'personal');
      expect(
        link.location,
        Routes.taskBoardTaskDetailPath('board-1', 'task-1'),
      );
      expect(link.openExternally, isFalse);
    });

    test('maps taskId query links to the same mobile task detail route', () {
      final link = resolveMobileDeepLink(
        Uri.parse(
          'https://tuturuuu.com/workspace-1/tasks/boards/board-1?taskId=task-1',
        ),
      );

      expect(link, isNotNull);
      expect(link!.workspaceSlug, 'workspace-1');
      expect(
        link.location,
        Routes.taskBoardTaskDetailPath('board-1', 'task-1'),
      );
    });

    test('maps board-only links to the mobile board detail route', () {
      final link = resolveMobileDeepLink(
        Uri.parse('https://tuturuuu.com/workspace-1/tasks/boards/board-1'),
      );

      expect(link, isNotNull);
      expect(link!.workspaceSlug, 'workspace-1');
      expect(link.location, Routes.taskBoardDetailPath('board-1'));
    });

    test('maps task app host board links', () {
      final link = resolveMobileDeepLink(
        Uri.parse('https://tasks.tuturuuu.com/workspace-1/boards/board-1'),
      );

      expect(link, isNotNull);
      expect(link!.workspaceSlug, 'workspace-1');
      expect(link.location, Routes.taskBoardDetailPath('board-1'));
    });

    test('maps workspace modules to mobile modules', () {
      expect(
        resolveMobileDeepLink(
          Uri.parse('https://tuturuuu.com/en/workspace-1/calendar'),
        )?.location,
        Routes.calendar,
      );
      expect(
        resolveMobileDeepLink(
          Uri.parse(
            'https://tuturuuu.com/workspace-1/finance/wallets/wallet-1',
          ),
        )?.location,
        Routes.walletDetailPath('wallet-1'),
      );
      expect(
        resolveMobileDeepLink(
          Uri.parse(
            'https://tuturuuu.com/workspace-1/tasks/projects/project-1',
          ),
        )?.location,
        Routes.taskPortfolioProjectPath('project-1'),
      );
    });

    test('marks native opt-out links for external opening', () {
      final link = resolveMobileDeepLink(
        Uri.parse(
          'https://tuturuuu.com/en/personal/tasks/boards/board-1?task=task-1&native=0',
        ),
      );

      expect(link, isNotNull);
      expect(link!.openExternally, isTrue);
      expect(
        link.location,
        Routes.taskBoardTaskDetailPath('board-1', 'task-1'),
      );
    });

    test('ignores unsupported hosts and unsupported legacy task paths', () {
      expect(
        resolveMobileDeepLink(
          Uri.parse('https://example.com/en/personal/tasks/boards/board-1'),
        ),
        isNull,
      );
      expect(
        resolveMobileDeepLink(
          Uri.parse('https://tuturuuu.com/personal/tasks/task-1'),
        ),
        isNull,
      );
    });
  });
}
