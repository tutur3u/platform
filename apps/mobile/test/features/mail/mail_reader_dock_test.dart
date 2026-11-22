import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

const _folders = <Map<String, dynamic>>[
  {'id': 'folder-1', 'name': 'Receipts', 'kind': 'custom'},
];

Map<String, dynamic> _detail({bool unread = false}) => {
  'id': 'm',
  'subject': 'Dock',
  'bodyText': 'Message body',
  'fromAddress': 'sender@example.test',
  'unread': unread,
};

Future<ShellDockActionGroup> _pumpDock(
  WidgetTester tester, {
  bool canSend = true,
  MailPrimaryAction primary = MailPrimaryAction.archive,
  String? sourceFolder = 'inbox',
  Map<String, dynamic>? detail,
  MailRepository? repository,
  VoidCallback? onClose,
}) async {
  SharedPreferences.setMockInitialValues({});
  final preference = MailPrimaryActionPreference.instance;
  final previous = preference.value;
  preference.value = primary;
  addTearDown(() => preference.value = previous);
  await tester.pumpApp(
    BlocProvider(
      create: (_) => ShellTitleOverrideCubit(),
      child: MailReader(
        repository: repository ?? _Repository(),
        workspaceId: 'ws',
        mailboxId: 'box',
        sourceFolder: sourceFolder,
        folders: _folders,
        thread: false,
        canSend: canSend,
        fromAddress: 'me@example.test',
        resolvePeople: (_, _) async => {},
        detail: detail ?? _detail(),
        onClose: onClose,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return tester
      .widget<ShellChromeActions>(find.byType(ShellChromeActions))
      .actionGroup!;
}

/// The reader's top navbar actions.
List<ShellActionSpec> _navbar(WidgetTester tester) =>
    tester.widget<ShellChromeActions>(find.byType(ShellChromeActions)).actions;

List<String> _ids(Iterable<dynamic> items) => [
  for (final item in items) (item as ShellDockMoreItem).id,
];

void main() {
  testWidgets('one bar of replies and More; Archive on the navbar', (
    tester,
  ) async {
    final group = await _pumpDock(tester);

    expect(_ids(group.actions), ['reply', 'reply-all', 'forward']);
    // No separate floating circle beside the bar.
    expect(group.primary, isNull);
    expect(
      [for (final section in group.more) _ids(section)],
      [
        ['mark-read', 'snooze', 'labels', 'move'],
        ['appearance', 'images', 'share'],
        ['trash'],
      ],
    );
    final delete = group.more.last.single as ShellDockGroupAction;
    expect(delete.label, 'Delete');
    expect(delete.destructive, isTrue);
    final navbar = _navbar(tester);
    expect([for (final action in navbar) action.id], ['mail-reader-quick']);
    expect(navbar.single.tooltip, 'Archive');
  });

  testWidgets('a mailbox that cannot send keeps its common commands on the '
      'bar', (tester) async {
    final group = await _pumpDock(tester, canSend: false);

    expect(_ids(group.actions), ['mark-read', 'snooze']);
    expect(group.more, isNotEmpty);
  });

  test('a saved reply preference migrates explicitly to Archive', () async {
    SharedPreferences.setMockInitialValues({
      MailPrimaryActionPreference.storageKey: 'reply',
    });
    final preference = MailPrimaryActionPreference()
      ..value = MailPrimaryAction.trash;
    await preference.load();
    expect(preference.value, MailPrimaryAction.archive);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(MailPrimaryActionPreference.storageKey), 'archive');
  });

  testWidgets('Archive on the navbar stays excluded from More', (tester) async {
    final group = await _pumpDock(tester);

    expect(group.primary, isNull);
    expect(_ids(group.actions), ['reply', 'reply-all', 'forward']);
    expect(_navbar(tester).single.tooltip, 'Archive');
    expect([
      for (final section in group.more) ..._ids(section),
    ], isNot(contains('archive')));
  });

  testWidgets('sheet labels follow message state', (tester) async {
    final group = await _pumpDock(tester, detail: _detail(unread: true));

    final read = group.more.first.singleWhere((item) => item.id == 'mark-read');
    expect(read.label, 'Mark as read');
  });

  testWidgets('archived mail offers Restore on the navbar', (tester) async {
    await _pumpDock(tester, sourceFolder: 'archive');

    expect(_navbar(tester).single.tooltip, 'Move to inbox');
  });

  testWidgets('the appearance row selects and applies a message theme', (
    tester,
  ) async {
    final group = await _pumpDock(tester);
    final appearance =
        group.more[1].singleWhere((item) => item.id == 'appearance')
            as ShellDockChoice;
    final previous = MailAppearancePreference.instance.value;
    addTearDown(() => MailAppearancePreference.instance.value = previous);

    expect(appearance.options.map((option) => option.id), [
      'original',
      'light',
      'dark',
    ]);
    appearance.onSelected('dark');
    await tester.pumpAndSettle();

    expect(MailAppearancePreference.instance.value, MailMessageAppearance.dark);
    final updated =
        tester
                .widget<ShellChromeActions>(find.byType(ShellChromeActions))
                .actionGroup!
                .more[1]
                .singleWhere((item) => item.id == 'appearance')
            as ShellDockChoice;
    expect(updated.selectedId, 'dark');
  });

  testWidgets('the inline reply row is gone', (tester) async {
    await _pumpDock(tester);

    expect(find.widgetWithText(TextButton, 'Reply all'), findsNothing);
    expect(find.widgetWithText(TextButton, 'Forward'), findsNothing);
  });

  testWidgets('Move in More lists the mailbox folders', (tester) async {
    final group = await _pumpDock(tester);

    (group.more.first.singleWhere((item) => item.id == 'move')
            as ShellDockGroupAction)
        .onPressed!();
    await tester.pumpAndSettle();

    expect(find.text('Receipts'), findsOneWidget);
  });
  testWidgets('a default of Mark unread marks it and returns to the list', (
    tester,
  ) async {
    final repository = _Repository();
    when(
      () => repository.changeState(
        'ws',
        'box',
        'm',
        'mark_unread',
        thread: false,
      ),
    ).thenAnswer((_) async {});
    var closed = false;
    await _pumpDock(
      tester,
      primary: MailPrimaryAction.markUnread,
      repository: repository,
      onClose: () => closed = true,
    );
    final quick = _navbar(tester).single;
    expect(quick.tooltip, 'Mark unread');

    quick.onPressed!();
    await tester.pumpAndSettle();

    verify(
      () => repository.changeState(
        'ws',
        'box',
        'm',
        'mark_unread',
        thread: false,
      ),
    ).called(1);
    expect(closed, isTrue);
  });
}
