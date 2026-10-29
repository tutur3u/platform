/// How soon an open ask wants an answer, as the publisher words it. An
/// unknown wire value is treated as absent, never as an error.
enum AskDeadline {
  withinHours('within_hours'),
  today('today'),
  tonight('tonight'),
  thisWeek('this_week');

  const AskDeadline(this.wireName);
  final String wireName;

  static AskDeadline? fromWire(Object? value) {
    for (final deadline in values) {
      if (deadline.wireName == value) return deadline;
    }
    return null;
  }
}

/// The publisher's urgency for an open ask. Unknown values are absent.
enum AskUrgency {
  low('low'),
  normal('normal'),
  high('high'),
  urgent('urgent');

  const AskUrgency(this.wireName);
  final String wireName;

  static AskUrgency? fromWire(Object? value) {
    for (final urgency in values) {
      if (urgency.wireName == value) return urgency;
    }
    return null;
  }
}
