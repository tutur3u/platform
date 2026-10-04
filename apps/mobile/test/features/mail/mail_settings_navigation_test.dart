import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  late _Repository repository;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    when(
      () => repository.settings('ws', 'box'),
    ).thenAnswer((_) async => {'settings': <String, dynamic>{}});
  });
  testWidgets('Mail settings uses one shell title and dock save', (
    tester,
  ) async {
    final title = ShellTitleOverrideCubit();
    final actions = ShellChromeActionsCubit();
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: title),
          BlocProvider.value(value: actions),
        ],
        child: MailSettingsPage(
          repository: repository,
          workspaceId: 'ws',
          mailboxId: 'box',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AppBar), findsNothing);
    expect(title.state.resolveForLocation('/mail'), 'Mail settings');
    final save = actions.state
        .resolveForLocation('/mail')
        .singleWhere((a) => a.id == 'mail-settings-save');
    expect(save.inDock, isTrue);
    expect(save.enabled, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    await title.close();
    await actions.close();
  });
  testWidgets('unsaved changes require confirmation before bottom Back', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => Navigator.of(context).push<void>(
            MaterialPageRoute(
              builder: (_) => MailSettingsPage(
                repository: repository,
                workspaceId: 'ws',
                mailboxId: 'box',
              ),
            ),
          ),
          child: const Text('Open settings'),
        ),
      ),
    );
    await tester.tap(find.text('Open settings'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Synthetic sender');
    await tester.pump();
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.text('Discard changes?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.byType(MailSettingsPage), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard changes'));
    await tester.pumpAndSettle();
    expect(find.byType(MailSettingsPage), findsNothing);
    verifyNever(() => repository.updateSettings(any(), any(), any()));
  });
  testWidgets('invalidated scope never reads or saves another actor settings', (
    tester,
  ) async {
    await tester.pumpApp(
      MailSettingsPage(
        repository: repository,
        workspaceId: 'ws',
        mailboxId: 'box',
        isScopeCurrent: () => false,
      ),
    );
    await tester.pump();
    verifyNever(() => repository.settings(any(), any()));
    verifyNever(() => repository.updateSettings(any(), any(), any()));
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
