import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_organization_page.dart';
import 'package:mobile/features/tasks_boards/view/task_board_form_dialog.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _MailRepository extends Mock implements MailRepository {}

/// A 390x844 phone with an open 300dp keyboard.
void _phoneWithKeyboard(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1
    ..viewInsets = const FakeViewPadding(bottom: 300);
  addTearDown(tester.view.reset);
}

void _expectOneBoundedSurface(WidgetTester tester, Finder save) {
  expect(find.byType(AppSheetSurface), findsOneWidget);
  final surface = tester.getRect(find.byType(AppSheetSurface));
  expect(surface.width, lessThanOrEqualTo(440));
  expect(surface.left, greaterThan(0));
  // The surface and its primary action sit above the keyboard.
  expect(surface.bottom, lessThanOrEqualTo(844 - 300));
  expect(save.hitTestable(), findsOneWidget);
  expect(tester.getRect(save).bottom, lessThanOrEqualTo(844 - 300));
  expect(tester.takeException(), isNull);
}

void main() {
  testWidgets('Mail organization editor opens on the shared dialog', (
    tester,
  ) async {
    _phoneWithKeyboard(tester);
    final repository = _MailRepository();
    when(
      () => repository.organization(any(), any()),
    ).thenAnswer((_) async => {'labels': <Map<String, dynamic>>[]});
    await tester.pumpApp(
      MailOrganizationPage(
        repository: repository,
        workspaceId: 'ws',
        mailboxId: 'mailbox',
        kind: 'labels',
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    expect(find.byType(AppDialog), findsOneWidget);
    _expectOneBoundedSurface(
      tester,
      find.byKey(const ValueKey('mail-organization-save')),
    );
    // barrierDismissible stays false: tapping outside keeps the editor open.
    await tester.tapAt(const Offset(4, 4));
    await tester.pumpAndSettle();
    expect(find.byType(AppDialog), findsOneWidget);
  });

  for (final launcher in ['showAppDialog', 'legacy shad.showDialog']) {
    testWidgets('board form opened by $launcher draws one dialog surface', (
      tester,
    ) async {
      _phoneWithKeyboard(tester);
      await tester.pumpApp(
        Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () {
                Widget form(BuildContext _) => const TaskBoardFormDialog(
                  title: 'New board',
                  confirmLabel: 'Create board',
                );
                if (launcher == 'showAppDialog') {
                  unawaited(
                    showAppDialog<void>(
                      context: context,
                      useRootNavigator: true,
                      builder: form,
                    ),
                  );
                } else {
                  unawaited(
                    shad.showDialog<void>(context: context, builder: form),
                  );
                }
              },
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      _expectOneBoundedSurface(
        tester,
        find.widgetWithText(AppButton, 'Create board'),
      );
    });
  }
}
