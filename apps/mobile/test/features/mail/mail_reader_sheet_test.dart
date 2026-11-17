import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_primary_action_preference.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  setUpAll(DesignRender.loadFonts);
  for (final (folder, quarantined, expected) in [
    ('inbox', false, 'Archive'),
    ('archive', false, 'Move to inbox'),
    ('trash', false, 'Move to inbox'),
    ('spam', true, 'Reply'),
    ('trash', true, 'Reply'),
  ]) {
    testWidgets('dock primary follows $folder quarantine=$quarantined', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({
        MailPrimaryActionPreference.storageKey: 'archive',
      });
      final preference = MailPrimaryActionPreference.instance;
      final previous = preference.value;
      preference.value = MailPrimaryAction.archive;
      addTearDown(() => preference.value = previous);
      final repository = _Repository();
      when(
        () =>
            repository.changeState('ws', 'box', 'm', 'restore', thread: false),
      ).thenAnswer((_) async {});
      var closed = false;
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellTitleOverrideCubit(),
          child: MailReader(
            repository: repository,
            workspaceId: 'ws',
            mailboxId: 'box',
            sourceFolder: folder,
            thread: false,
            canSend: true,
            fromAddress: 'me@example.test',
            onClose: () => closed = true,
            resolvePeople: (_, _) async => {},
            detail: {
              'id': 'm',
              'subject': 'Context',
              'bodyText': 'Message body',
              'fromAddress': 'sender@example.test',
              'unread': false,
              'status': quarantined ? 'quarantined' : 'received',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final chrome = tester.widget<ShellChromeActions>(
        find.byType(ShellChromeActions),
      );
      final primary = chrome.actions.singleWhere(
        (action) => action.id == 'mail-primary-action',
      );
      expect(primary.tooltip, expected);
      if (folder != 'inbox' && !quarantined) {
        primary.onPressed!();
        await tester.pumpAndSettle();
        expect(closed, isTrue);
        verify(
          () => repository.changeState(
            'ws',
            'box',
            'm',
            'restore',
            thread: false,
          ),
        ).called(1);
      }
      expect(tester.takeException(), isNull);
    });
  }

  for (final folder in ['inbox', 'archive']) {
    testWidgets('mixed quarantine thread keeps $folder organization actions', (
      tester,
    ) async {
      await tester.pumpApp(
        MailReader(
          repository: _Repository(),
          workspaceId: 'ws',
          mailboxId: 'box',
          sourceFolder: folder,
          thread: true,
          canSend: false,
          fromAddress: 'me@example.test',
          resolvePeople: (_, _) async => {},
          detail: const {
            'thread': {
              'id': 'thread',
              'subject': 'Legitimate thread',
              'status': 'active',
            },
            'messages': [
              {
                'id': 'good',
                'fromAddress': 'sender@example.test',
                'bodyText': 'Legitimate message',
                'status': 'received',
                'unread': false,
              },
              {
                'id': 'spam',
                'fromAddress': 'other@example.test',
                'bodyText': 'Quarantined reply',
                'status': 'quarantined',
                'unread': false,
              },
            ],
          },
        ),
      );
      await tester.pumpAndSettle();
      final organization = folder == 'archive' ? 'restore' : 'archive';
      expect(
        find.byTooltip(folder == 'archive' ? 'Move to inbox' : 'Archive'),
        findsOneWidget,
      );
      expect(find.byTooltip('Trash'), findsOneWidget);
      await tester.tap(find.byTooltip('Show menu'));
      await tester.pumpAndSettle();
      final sheet = tester.widget<AppActionSheet<String>>(
        find.byType(AppActionSheet<String>),
      );
      final values = sheet.actions.map((action) => action.value).toSet();
      expect(values, containsAll([organization, 'trash']));
      expect(tester.takeException(), isNull);
    });
  }

  for (final brightness in Brightness.values) {
    for (final (status, quarantined) in [
      ('inbox', false),
      ('archive', false),
      ('spam', true),
      ('trash', false),
      ('trash', true),
    ]) {
      final reversed =
          !quarantined && (status == 'archive' || status == 'trash');
      testWidgets(
        '${brightness.name} $status quarantine=$quarantined actions',
        (tester) async {
          DesignRender.setSize(tester, const Size(390, 844));
          await tester.pumpThemedHome(
            MailReader(
              repository: _Repository(),
              workspaceId: 'ws',
              mailboxId: 'box',
              sourceFolder: status,
              thread: true,
              canSend: true,
              fromAddress: 'me@example.test',
              resolvePeople: (_, _) async => {},
              detail: {
                'thread': {
                  'id': 'thread',
                  'subject': 'helppp',
                  'status': 'active',
                  'muted': reversed,
                  'snoozedUntil': reversed ? '2026-11-18T10:00:00Z' : null,
                },
                'messages': [
                  <String, dynamic>{
                    'id': 'm',
                    'subject': 'helppp',
                    'fromAddress': 'sender@example.test',
                    'bodyText': 'Message body',
                    'unread': false,
                    'status': quarantined ? 'quarantined' : 'received',
                  },
                ],
              },
            ),
            brightness: brightness,
            wrap: (app) =>
                RepaintBoundary(key: DesignRenderApp.boundaryKey, child: app),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byTooltip('Show menu'));
          await tester.pumpAndSettle();
          final sheet = tester.widget<AppActionSheet<String>>(
            find.byType(AppActionSheet<String>),
          );
          expect(sheet.title, 'helppp');
          final values = sheet.actions.map((action) => action.value).toSet();
          expect(
            values,
            containsAll([
              if (reversed) 'unsnooze' else 'snooze',
              if (reversed) 'unmute' else 'mute',
              if (reversed) 'restore' else if (!quarantined) 'archive',
              'mark_unread',
              if (status != 'trash' && !quarantined) 'trash',
            ]),
          );
          for (final value in [
            if (reversed) 'snooze' else 'unsnooze',
            if (reversed) 'mute' else 'unmute',
            if (reversed) 'archive' else 'restore',
            'reply',
            'forward',
          ]) {
            expect(values, isNot(contains(value)));
          }
          if (quarantined) {
            expect(
              values.intersection({'restore', 'archive', 'trash'}),
              isEmpty,
            );
          }
          if (status == 'trash') expect(values, isNot(contains('trash')));
          expect(find.text('Show menu'), findsNothing);
          expect(tester.takeException(), isNull);
          await DesignRender.capture(
            tester,
            'reader-sheet-${brightness.name}-$status-$quarantined',
          );
        },
      );
    }
  }
}
