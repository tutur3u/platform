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
          'user_name': 'Ada',
          'content': 'March progress',
          'group_name': 'Morning group',
          'period_start': '2026-03-01',
          'feedback': '   ',
          'report_stage': 'draft',
        },
      ],
    });
    expect(records.single.title, 'March');
    expect(records.single.subtitle, 'Ada');
    final report = records.single.report!;
    expect(report.group, 'Morning group');
    expect(report.content, 'March progress');
    expect(report.feedback, isNull);
    expect(report.periodStart, DateTime(2026, 3));
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
    }, kind: ContactApprovalKind.reports);
    expect(records.single.trailing, 'pending');
  });

  test('post approval preserves the recipient-specific item identifier', () {
    final records = contactApprovalRecords({
      'items': [
        {
          'id': 'post:recipient',
          'title': 'Class recap',
          'user_name': 'Ada',
          'post_approval_status': 'PENDING',
          'notes': 'Recipient notes',
        },
      ],
    }, kind: ContactApprovalKind.posts);
    expect(records.single.id, 'post:recipient');
    expect(records.single.subtitle, 'Ada');
    expect(records.single.trailing, 'PENDING');
    expect(records.single.approval?.comment, 'Recipient notes');
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
