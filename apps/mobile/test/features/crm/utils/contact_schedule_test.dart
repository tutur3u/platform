import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_schedule.dart';

void main() {
  test('sessions group by local start day', () {
    final days = contactScheduleDays(const [
      CrmSession(
        id: 'later',
        groupId: 'g',
        startsAt: '2026-05-02T01:00:00.000Z',
        endsAt: '2026-05-02T02:00:00.000Z',
      ),
      CrmSession(
        id: 'earlier',
        groupId: 'g',
        startsAt: '2026-05-01T01:00:00.000Z',
        endsAt: '2026-05-01T02:00:00.000Z',
        title: 'Morning',
      ),
    ]);
    expect(days, hasLength(2));
    expect(days.first.sessions.single.id, 'earlier');
    expect(contactSessionDate(days.first.sessions.single), isNotNull);
  });

  test('attendance status cycles and then clears', () {
    expect(contactNextAttendanceStatus('NONE'), 'PRESENT');
    expect(contactNextAttendanceStatus('PRESENT'), 'LATE');
    expect(contactNextAttendanceStatus('LATE'), 'ABSENT');
    expect(contactNextAttendanceStatus('ABSENT'), 'NONE');
  });
}
