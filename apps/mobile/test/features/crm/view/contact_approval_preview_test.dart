import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
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
