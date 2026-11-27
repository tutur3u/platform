import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_sidebar_sections.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';
import 'mail_preview_harness.dart';

const _labels = [
  {'id': 'label-1', 'name': 'Finance', 'color': '#22C55E', 'kind': 'custom'},
  {'id': 'label-2', 'name': 'Travel', 'kind': 'custom'},
];

MailPreviewRepository _repository() {
  final repository = MailPreviewRepository();
  stubMailPreview(repository, threads: 2, latency: Duration.zero);
  when(() => repository.bootstrap('ws')).thenAnswer(
    (_) async => {
      'mailboxes': [
        {
          'id': 'box',
          'address': 'synthetic@example.invalid',
          'status': 'active',
          'role': 'owner',
          'unreadCount': 4,
        },
      ],
    },
  );
  when(() => repository.organization('ws', 'box')).thenAnswer(
    (_) async => {
      'labels': _labels,
      'folders': [
        {'id': 'folder-1', 'name': 'Receipts', 'kind': 'custom'},
      ],
    },
  );
  return repository;
}

MailSidebarRow _row(WidgetTester tester, String key) =>
    tester.widget<MailSidebarRow>(find.byKey(ValueKey(key)));

void main() {
  testWidgets('the sidebar lists folders and labels; a label filters', (
    tester,
  ) async {
    setMailSurface(tester, const Size(1600, 900));
    final repository = _repository();
    await tester.pumpApp(
      Padding(
        padding: const EdgeInsets.only(left: 240),
        child: MailWorkspace(workspaceId: 'ws', repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    expect(_row(tester, 'mail-folder-inbox').selected, isTrue);
    expect(_row(tester, 'mail-folder-inbox').count, 4);
    expect(find.byKey(const ValueKey('mail-folder-blocked')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('mail-custom-folder-folder-1')),
      findsOneWidget,
    );

    // Labels start closed, as on web, with their count on the heading.
    expect(find.byKey(const ValueKey('mail-label-label-1')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('mail-section-labels')));
    await tester.pumpAndSettle();
    expect(_row(tester, 'mail-label-label-1').dotColor, isNotNull);

    await tester.tap(find.byKey(const ValueKey('mail-label-label-1')));
    await tester.pumpAndSettle();
    verify(
      () => repository.list(
        'ws',
        'box',
        folder: 'inbox',
        query: any(named: 'query'),
        label: 'label-1',
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).called(greaterThanOrEqualTo(1));
    expect(_row(tester, 'mail-label-label-1').selected, isTrue);
    expect(_row(tester, 'mail-folder-inbox').selected, isFalse);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('mail-list-title'))).data,
      'Finance',
    );

    // Folders collapse to their heading.
    await tester.tap(find.byKey(const ValueKey('mail-section-folders')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mail-folder-inbox')), findsNothing);
    expect(tester.takeException(), isNull);
    await drain(tester);
  });

  testWidgets('the shell rail carries folders when a local pane cannot fit', (
    tester,
  ) async {
    setMailSurface(tester, const Size(1440, 900));
    final repository = _repository();
    final miniNav = ShellMiniNavCubit();
    final actions = ShellChromeActionsCubit();
    final titles = ShellTitleOverrideCubit();
    addTearDown(miniNav.close);
    addTearDown(actions.close);
    addTearDown(titles.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: miniNav),
          BlocProvider.value(value: actions),
          BlocProvider.value(value: titles),
        ],
        child: Center(
          child: SizedBox(
            width: 754,
            child: MailWorkspace(workspaceId: 'ws', repository: repository),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    List<ShellMiniNavItemSpec> items() =>
        miniNav.state.resolveForLocation(Routes.mail)!.items;
    ShellMiniNavItemSpec item(String id) =>
        items().singleWhere((item) => item.id == id);

    expect(item('section-folders').heading, isTrue);
    expect(item('folder-inbox').count, 4);
    expect(item('folder-inbox').selected, isTrue);
    expect(item('folder-blocked').label, 'Blocked');
    expect(item('custom-folder-folder-1').label, 'Receipts');
    expect(item('section-labels').count, 2);
    expect(items().any((item) => item.id == 'label-label-1'), isFalse);

    item('section-labels').onPressed!();
    await tester.pumpAndSettle();
    expect(item('label-label-1').dotColor, isNotNull);

    item('label-label-1').onPressed!();
    await tester.pumpAndSettle();
    expect(item('label-label-1').selected, isTrue);
    expect(item('folder-inbox').selected, isFalse);
    verify(
      () => repository.list(
        'ws',
        'box',
        folder: 'inbox',
        query: any(named: 'query'),
        label: 'label-1',
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).called(greaterThanOrEqualTo(1));

    item('section-folders').onPressed!();
    await tester.pumpAndSettle();
    expect(items().any((item) => item.id == 'folder-inbox'), isFalse);
    expect(tester.takeException(), isNull);
    await drain(tester);
  });
}
