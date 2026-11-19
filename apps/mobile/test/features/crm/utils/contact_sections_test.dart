import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';

void main() {
  test('report rows keep a title and stage', () {
    final records = contactReportRecords({
      'data': [
        {
          'id': 'r1',
          'title': 'March',
          'user_email': 'ada@example.com',
          'report_stage': 'draft',
        },
      ],
    });
    expect(records.single.title, 'March');
    expect(records.single.subtitle, 'ada@example.com');
    expect(records.single.trailing, 'draft');
  });

  test('approval rows read the pending queue', () {
    final records = contactApprovalRecords({
      'items': [
        {
          'id': 'a1',
          'title': 'Weekly note',
          'user_display_name': 'Ada',
          'report_approval_status': 'pending',
        },
      ],
    });
    expect(records.single.trailing, 'pending');
  });

  test('guest leads ignore people who are not guests', () {
    final records = contactGuestLeadRecords({
      'data': [
        {'id': '1', 'full_name': 'Member', 'is_guest': false},
        {
          'id': '2',
          'full_name': 'Guest',
          'group_name': 'Morning',
          'is_guest': true,
        },
      ],
    });
    expect(records.single.title, 'Guest');
    expect(records.single.subtitle, 'Morning');
  });
}
