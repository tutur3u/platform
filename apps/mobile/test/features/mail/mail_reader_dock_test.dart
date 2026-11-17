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
      ),
    ),
  );
  await tester.pumpAndSettle();
  return tester
      .widget<ShellChromeActions>(find.byType(ShellChromeActions))
      .actionGroup!;
}

List<String> _ids(Iterable<dynamic> items) => [
  for (final item in items) (item as ShellDockMoreItem).id,
];

void main() {
  testWidgets('the dock holds replies, the primary circle and More', (
    tester,
  ) async {
    final group = await _pumpDock(tester);

    expect(_ids(group.actions), ['reply', 'reply-all', 'forward']);
    expect(group.primary!.id, 'archive');
    expect(
      [for (final section in group.more) _ids(section)],
      [
        ['inbox', 'appearance', 'images'],
        ['star', 'mark-read', 'move', 'trash'],
      ],
    );
    expect(group.primary!.label, 'Archive');
    expect(
      group.more.last.singleWhere((item) => item.id == 'trash'),
      isA<ShellDockGroupAction>().having(
        (action) => action.destructive,
        'destructive',
        isTrue,
      ),
    );
  });

  testWidgets('a mailbox that cannot send offers More only', (tester) async {
    final group = await _pumpDock(tester, canSend: false);

    expect(group.actions, isEmpty);
    expect(group.more, isNotEmpty);
  });

  testWidgets('the circle set to Reply drops the pill Reply slot', (
    tester,
  ) async {
    final group = await _pumpDock(tester, primary: MailPrimaryAction.reply);

    expect(group.primary!.id, 'reply');
    expect(_ids(group.actions), ['reply-all', 'forward']);
    expect([
      for (final section in group.more) ..._ids(section),
    ], contains('archive'));
  });

  testWidgets('sheet labels follow message state', (tester) async {
    final group = await _pumpDock(tester, detail: _detail(unread: true));

    final read = group.more.last.singleWhere((item) => item.id == 'mark-read');
    expect(read.label, 'Mark as read');
  });

  testWidgets('archived mail offers Restore in the sheet', (tester) async {
    final group = await _pumpDock(
      tester,
      sourceFolder: 'archive',
      primary: MailPrimaryAction.reply,
    );

    expect(
      group.more.last.singleWhere((item) => item.id == 'archive').label,
      'Move to inbox',
    );
  });

  testWidgets('the appearance row selects and applies a message theme', (
    tester,
  ) async {
    final group = await _pumpDock(tester);
    final appearance =
        group.more.first.singleWhere((item) => item.id == 'appearance')
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
                .more
                .first
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

    (group.more.last.singleWhere((item) => item.id == 'move')
            as ShellDockGroupAction)
        .onPressed!();
    await tester.pumpAndSettle();

    expect(find.text('Receipts'), findsOneWidget);
  });
}
