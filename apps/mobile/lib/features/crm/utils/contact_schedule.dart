import 'package:mobile/data/models/crm/crm_models.dart';

class ContactScheduleDay {
  const ContactScheduleDay({required this.day, required this.sessions});

  final DateTime day;
  final List<CrmSession> sessions;
}

/// Groups sessions by the device-local start day, earliest first.
List<ContactScheduleDay> contactScheduleDays(List<CrmSession> sessions) {
  final byDay = <String, List<CrmSession>>{};
  final days = <String, DateTime>{};
  for (final session in sessions) {
    final start = DateTime.tryParse(session.startsAt)?.toLocal();
    if (start == null) continue;
    final day = DateTime(start.year, start.month, start.day);
    final key = '${day.year}-${day.month}-${day.day}';
    byDay.putIfAbsent(key, () => <CrmSession>[]).add(session);
    days[key] = day;
  }
  final keys = byDay.keys.toList()
    ..sort((a, b) => days[a]!.compareTo(days[b]!));
  return [
    for (final key in keys)
      ContactScheduleDay(day: days[key]!, sessions: byDay[key]!),
  ];
}

/// `YYYY-MM-DD` for the device-local start of a session.
String? contactSessionDate(CrmSession session) {
  final start = DateTime.tryParse(session.startsAt)?.toLocal();
  if (start == null) return null;
  final month = start.month.toString().padLeft(2, '0');
  final day = start.day.toString().padLeft(2, '0');
  return '${start.year}-$month-$day';
}

/// Next status in Present, Late, Absent, then cleared.
String contactNextAttendanceStatus(String status) {
  return switch (status.toUpperCase()) {
    'NONE' || '' => 'PRESENT',
    'PRESENT' => 'LATE',
    'LATE' => 'ABSENT',
    _ => 'NONE',
  };
}
