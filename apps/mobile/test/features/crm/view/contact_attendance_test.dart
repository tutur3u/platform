import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/view/contact_attendance_sheet.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('attendance tap cycles a member and save sends that status', (
    tester,
  ) async {
    Map<String, String>? saved;
    await tester.pumpThemedHome(
      ContactAttendanceSheet(
        title: 'Morning',
        canEdit: true,
        members: const [CrmGroupMember(id: 'u1', displayName: 'Ada')],
        initialStatus: const {},
        onSave: (status) async {
          saved = status;
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Not marked'), findsOneWidget);
    await tester.tap(find.text('Ada'));
    await tester.pumpAndSettle();
    expect(find.text('Present'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('contact-attendance-save')));
    await tester.pumpAndSettle();
    expect(saved, {'u1': 'PRESENT'});
  });

  for (final theme in ['light', 'dark']) {
    testWidgets('clears an existing attendance mark in $theme', (tester) async {
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      Map<String, String>? saved;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: ContactAttendanceSheet(
            title: 'Study group · Nov 19, 2026',
            members: const [
              CrmGroupMember(id: 'ava', displayName: 'Ava Nguyen'),
              CrmGroupMember(id: 'sam', displayName: 'Sam Le'),
            ],
            initialStatus: const {'ava': 'ABSENT', 'sam': 'PRESENT'},
            canEdit: true,
            onSave: (status) async => saved = Map.of(status),
          ),
        ),
      );

      await tester.tap(find.text('Ava Nguyen'));
      await tester.pumpAndSettle();
      expect(find.text('Not marked'), findsOneWidget);
      await DesignRender.capture(tester, 'contacts-attendance-$theme');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(saved, {'ava': 'NONE', 'sam': 'PRESENT'});
    });
  }
}
