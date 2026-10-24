import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/data/mail_settings_snapshot.dart';
import 'package:mobile/features/mail/view/mail_settings_chrome.dart';
import 'package:mobile/features/mail/view/mail_settings_hub.dart';
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
    when(() => repository.cachedSettings('ws', 'box')).thenAnswer(
      (_) async => {
        'settings': {'senderName': 'Stored sender'},
      },
    );
    when(
      () => repository.updateSettings(any(), any(), any()),
    ).thenAnswer((_) async {});
  });

  testWidgets(
    'shows the scoped cache before a slow fresh response and preserves typing',
    (tester) async {
      final refresh = Completer<Map<String, dynamic>>();
      when(
        () => repository.settings('ws', 'box'),
      ).thenAnswer((_) => refresh.future);
      await tester.pumpApp(
        MailSettingsPage(
          repository: repository,
          workspaceId: 'ws',
          mailboxId: 'box',
        ),
      );
      await tester.pump();
      await tester.pump();
      final sender = find.byType(AppTextField).first;
      expect(
        tester.widget<AppTextField>(sender).controller!.text,
        'Stored sender',
      );
      expect(find.byType(MailSettingsSkeleton), findsNothing);
      await tester.enterText(
        find.descendant(of: sender, matching: find.byType(TextField)),
        'In-progress edit',
      );
      refresh.complete({
        'settings': {'senderName': 'Fresh server sender'},
      });
      await tester.pump();
      await tester.pump();
      expect(
        tester.widget<AppTextField>(sender).controller!.text,
        'In-progress edit',
      );
      verify(() => repository.settings('ws', 'box')).called(1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final status in [403, 404]) {
    testWidgets('$status clears an already-visible cached editor', (
      tester,
    ) async {
      final refresh = Completer<Map<String, dynamic>>();
      when(
        () => repository.settings('ws', 'box'),
      ).thenAnswer((_) => refresh.future);
      await tester.pumpApp(
        MailSettingsPage(
          repository: repository,
          workspaceId: 'ws',
          mailboxId: 'box',
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.byType(AppTextField), findsWidgets);
      refresh.completeError(
        ApiException(message: 'Denied', statusCode: status),
      );
      await tester.pump();
      await tester.pump();
      expect(find.byType(AppTextField), findsNothing);
      expect(find.text('Retry'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'restores account rows without turning them into management grants',
    (tester) async {
      final refresh = Completer<Map<String, dynamic>>();
      when(() => repository.cachedSettingsAccounts('ws')).thenAnswer(
        (_) async => {
          'mailboxes': [
            {'id': 'box', 'address': 'stored@example.test'},
          ],
        },
      );
      when(
        () => repository.settingsBootstrap('ws'),
      ).thenAnswer((_) => refresh.future);
      await tester.pumpApp(
        MailSettingsHub(
          workspaceId: 'ws',
          locations: const {'/test'},
          isScopeCurrent: () => true,
          repository: repository,
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text('stored@example.test'), findsOneWidget);
      expect(find.byType(MailSettingsSkeleton), findsNothing);
      // Membership remains pending while the stored settings open immediately.
      await tester.tap(find.text('stored@example.test'));
      await tester.pumpAndSettle();
      final editor = tester.widget<MailSettingsPage>(
        find.byType(MailSettingsPage),
      );
      expect(editor.canManage, isFalse);
      expect(editor.readOnlySnapshot, isTrue);
      final serverFields = tester.widgetList<AppTextField>(
        find.byType(AppTextField),
      );
      expect(serverFields, isNotEmpty);
      expect(serverFields.every((field) => !field.enabled), isTrue);
      expect(find.byTooltip('Save'), findsNothing);
      verifyNever(() => repository.settings(any(), any()));
      verifyNever(() => repository.updateSettings(any(), any(), any()));
      refresh.complete({
        'mailboxes': [
          {'id': 'box', 'address': 'stored@example.test'},
        ],
      });
      await tester.pump();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('dock Save closes an acknowledged dirty editor', (tester) async {
    when(() => repository.settings('ws', 'box')).thenAnswer(
      (_) async => {
        'settings': {'senderName': 'Stored sender'},
      },
    );
    final titles = ShellTitleOverrideCubit();
    final actions = ShellChromeActionsCubit();
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: titles),
          BlocProvider.value(value: actions),
        ],
        child: Builder(
          builder: (context) => AppButton(
            onPressed: () => Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => MultiBlocProvider(
                  providers: [
                    BlocProvider.value(value: titles),
                    BlocProvider.value(value: actions),
                  ],
                  child: MailSettingsPage(
                    repository: repository,
                    workspaceId: 'ws',
                    mailboxId: 'box',
                  ),
                ),
              ),
            ),
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Saved sender');
    await tester.pump();
    final save = actions.state
        .resolveForLocation('/mail')
        .singleWhere((action) => action.id == 'mail-settings-save');
    expect(save.inDock, isTrue);
    expect(find.byType(AppBar), findsNothing);
    save.onPressed!();
    await tester.pumpAndSettle();
    expect(find.byType(MailSettingsPage), findsNothing);
    verify(() => repository.updateSettings('ws', 'box', any())).called(1);
    await tester.pumpWidget(const SizedBox.shrink());
    await titles.close();
    await actions.close();
  });

  for (final status in [
    PendingMutationStatus.queued,
    PendingMutationStatus.conflict,
  ]) {
    testWidgets('unacknowledged Save stays open and shows $status', (
      tester,
    ) async {
      final mutations = OfflineMutationQueue.instance.pending;
      final previous = mutations.value;
      mutations.value = [];
      addTearDown(() => mutations.value = previous);
      when(() => repository.settings('ws', 'box')).thenAnswer(
        (_) async => {
          'settings': {'senderName': 'Stored sender'},
        },
      );
      when(() => repository.updateSettings('ws', 'box', any())).thenAnswer((
        _,
      ) async {
        mutations.value = [
          PendingMutationRecord(
            id: 'operation',
            feature: 'mail',
            method: 'PATCH',
            path: '${MailRepository.mailboxPath('ws', 'box')}/settings',
            userId: currentCacheUserId(),
            workspaceId: 'ws',
            createdAt: DateTime.utc(2026),
            status: status,
            payload: const {'senderName': 'Queued sender'},
            optimisticPatch: {'entityId': mailSettingsEntityId('box')},
          ),
        ];
      });
      await tester.pumpApp(
        Builder(
          builder: (context) => AppButton(
            onPressed: () => Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => MailSettingsPage(
                  repository: repository,
                  workspaceId: 'ws',
                  mailboxId: 'box',
                ),
              ),
            ),
            child: const Text('Open'),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Queued sender');
      await tester.pump();
      await tester.tap(find.byTooltip('Save'));
      await tester.pumpAndSettle();
      expect(find.byType(MailSettingsPage), findsOneWidget);
      expect(
        find.text(
          status == PendingMutationStatus.queued
              ? 'Waiting to sync'
              : 'Needs review before syncing',
        ),
        findsOneWidget,
      );
      expect(mutations.value.single.id, 'operation');
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('pending replay freezes edits until fresh baseline then sends only new field', (tester) async {
    final mutations = OfflineMutationQueue.instance.pending;
    final previous = mutations.value;
    mutations.value = [];
    addTearDown(() => mutations.value = previous);
    var server = <String, dynamic>{'senderName': 'Before'};
    Completer<Map<String, dynamic>>? refresh;
    when(() => repository.settings('ws', 'box')).thenAnswer((_) async =>
      refresh == null ? {'settings': server} : await refresh!.future);
    final payloads = <Map<String, dynamic>>[];
    when(() => repository.updateSettings('ws', 'box', any())).thenAnswer((invocation) async {
      payloads.add(Map<String, dynamic>.from(invocation.positionalArguments[2] as Map));
      if (payloads.length == 1) {
        mutations.value = [PendingMutationRecord(id: 'first', feature: 'mail_settings',
          method: 'PATCH', path: '${MailRepository.mailboxPath('ws', 'box')}/settings',
          userId: currentCacheUserId(), workspaceId: 'ws', createdAt: DateTime.utc(2026),
          payload: payloads.single, optimisticPatch: {'entityId': mailSettingsEntityId('box')})];
      }
    });
    await tester.pumpApp(MailSettingsPage(repository: repository, workspaceId: 'ws', mailboxId: 'box'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Queued');
    await tester.tap(find.byTooltip('Save'));
    await tester.pumpAndSettle();
    expect(payloads.single, {'senderName': 'Queued'});
    expect(tester.widget<AppTextField>(find.byType(AppTextField).first).enabled, isFalse);
    refresh = Completer<Map<String, dynamic>>();
    mutations.value = [];
    await tester.pump();
    expect(tester.widget<AppTextField>(find.byType(AppTextField).first).enabled, isFalse);
    server = {'senderName': 'New web sender'};
    refresh!.complete({'settings': server});
    await tester.pumpAndSettle();
    expect(tester.widget<AppTextField>(find.byType(AppTextField).first).enabled, isTrue);
    final instructions = find.byType(AppTextField).at(2);
    await tester.ensureVisible(instructions);
    await tester.enterText(find.descendant(of: instructions, matching: find.byType(TextField)), 'New instructions');
    await tester.tap(find.byTooltip('Save'));
    await tester.pumpAndSettle();
    expect(payloads.last, {'aiInstructions': 'New instructions'});
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('rejected settings recover only after a fresh management grant', (tester) async {
    when(() => repository.settings('ws', 'box')).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
    when(() => repository.settingsBootstrap('ws')).thenAnswer((_) async => {
      'mailboxes': [{'id': 'box', 'role': 'owner'}],
    });
    await tester.pumpApp(MailSettingsPage(repository: repository, workspaceId: 'ws', mailboxId: 'box'));
    await tester.pumpAndSettle();
    expect(find.byType(AppTextField), findsNothing);
    when(() => repository.settings('ws', 'box')).thenAnswer((_) async => {'settings': {'senderName': 'Restored'}});
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    verify(() => repository.settingsBootstrap('ws')).called(1);
    expect(tester.widget<AppTextField>(find.byType(AppTextField).first).enabled, isTrue);
    expect(tester.widget<AppTextField>(find.byType(AppTextField).first).controller!.text, 'Restored');
    await tester.enterText(find.byType(TextField).first, 'Recovered edit');
    await tester.tap(find.byTooltip('Save'));
    await tester.pumpAndSettle();
    verify(() => repository.updateSettings('ws', 'box', {'senderName': 'Recovered edit'})).called(1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final width in [320.0, 390.0, 430.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('long account address fits $width at text scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        const address =
            'very.long.department.and.account.name@subdomain.example.test';
        var opened = false;
        await tester.pumpApp(
          MediaQuery(
            data: MediaQueryData(
              size: Size(width, 800),
              textScaler: TextScaler.linear(scale),
            ),
            child: Align(
              alignment: Alignment.topCenter,
              child: MailSettingsAccountRow(
                address: address,
                onTap: () => opened = true,
              ),
            ),
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
        final row = find.byType(MailSettingsAccountRow);
        expect(tester.getSize(row).width, lessThanOrEqualTo(width));
        expect(find.byTooltip(address), findsOneWidget);
        await tester.tap(find.text(address));
        expect(opened, isTrue);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
