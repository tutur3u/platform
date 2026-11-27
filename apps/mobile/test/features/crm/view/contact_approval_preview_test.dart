import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/features/crm/view/contact_approval_preview.dart';

import '../../../helpers/design_render_harness.dart';

void main() {
  const approval = ContactApprovalDetails(
    kind: ContactApprovalKind.reports,
    group: 'Reading group',
    content: 'Completed the assigned reading.',
    comment: 'Review the final chapter next week.',
  );
  const record = ContactSectionRecord(
    id: 'report-1',
    title: 'Weekly report',
    subtitle: 'Test contact',
    approval: approval,
  );

  for (final theme in ['light', 'dark']) {
    testWidgets('submits a trimmed rejection reason in $theme', (tester) async {
      final decisions = <(ContactApprovalDecision, String?)>[];
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: Builder(
            builder: (context) => AppButton.primary(
              onPressed: () => showAppSheet<void>(
                context: context,
                builder: (context) => ContactApprovalPreview(
                  record: record,
                  approval: approval,
                  onReview: (decision, reason) async =>
                      decisions.add((decision, reason)),
                ),
              ),
              child: const Text('Open approval'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open approval'));
      await tester.pumpAndSettle();
      expect(find.text('Reading group'), findsOneWidget);
      expect(find.text('Completed the assigned reading.'), findsOneWidget);
      await tester.tap(find.text('Reject'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reject'), warnIfMissed: false);
      expect(decisions, isEmpty);
      await tester.enterText(
        find.descendant(
          of: find.byKey(const ValueKey('approval-rejection-reason')),
          matching: find.byType(EditableText),
        ),
        '  Needs more detail  ',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      await DesignRender.capture(tester, 'contacts-approval-reject-$theme');
      await tester.tap(find.text('Reject'));
      await tester.pumpAndSettle();
      expect(decisions, [
        (ContactApprovalDecision.reject, 'Needs more detail'),
      ]);
      expect(find.text('Weekly report'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('revoking review access during confirmation prevents approval', (
    tester,
  ) async {
    final canReview = ValueNotifier(true);
    addTearDown(canReview.dispose);
    var decisions = 0;
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: Builder(
          builder: (context) => AppButton.primary(
            onPressed: () => showAppSheet<void>(
              context: context,
              builder: (context) => ValueListenableBuilder(
                valueListenable: canReview,
                builder: (context, allowed, child) => ContactApprovalPreview(
                  record: record,
                  approval: approval,
                  onReview: allowed
                      ? (_, _) async {
                          decisions++;
                        }
                      : null,
                ),
              ),
            ),
            child: const Text('Open approval'),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open approval'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    canReview.value = false;
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve').last);
    await tester.pumpAndSettle();
    expect(decisions, 0);
    expect(find.text('Weekly report'), findsOneWidget);
  });

  testWidgets('rechecks the originating scope after confirmation', (
    tester,
  ) async {
    var scopeCurrent = true;
    var decisions = 0;
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: ContactApprovalPreview(
          record: record,
          approval: approval,
          isReviewCurrent: () => scopeCurrent,
          onReview: (_, _) async {
            decisions++;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    scopeCurrent = false;
    await tester.tap(find.text('Approve').last);
    await tester.pumpAndSettle();
    expect(decisions, 0);
    expect(find.text('Approve'), findsNothing);
    expect(find.text('Reject'), findsNothing);
  });

  testWidgets('transport failure blocks retry from the same preview', (
    tester,
  ) async {
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: ContactApprovalPreview(
          record: record,
          approval: approval,
          onReview: (_, _) async {
            throw const ApiException.transport(message: 'Request timed out');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve').last);
    await tester.pumpAndSettle();
    expect(find.text('Weekly report'), findsOneWidget);
    expect(find.text('Approve'), findsNothing);
    expect(find.text('Reject'), findsNothing);
    expect(
      find.textContaining('It may have reached the server'),
      findsOneWidget,
    );
  });

  testWidgets('view-only preview has no approval actions', (tester) async {
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: const ContactApprovalPreview(
          record: record,
          approval: approval,
          onReview: null,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Weekly report'), findsOneWidget);
    expect(find.text('Approve'), findsNothing);
    expect(find.text('Reject'), findsNothing);
  });
}
