import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/view/contact_attendance_sheet.dart';

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
}
