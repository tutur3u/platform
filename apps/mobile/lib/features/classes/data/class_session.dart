import 'package:equatable/equatable.dart';

/// One scheduled class meeting, as listed by the group sessions API.
class ClassSession extends Equatable {
  const ClassSession({
    required this.id,
    required this.groupId,
    required this.startsAt,
    required this.endsAt,
    this.groupName,
    this.title,
  });

  static ClassSession? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final groupId = json['groupId'];
    final startsAt = DateTime.tryParse('${json['startsAt']}');
    final endsAt = DateTime.tryParse('${json['endsAt']}');
    if (id is! String || groupId is! String) return null;
    if (startsAt == null || endsAt == null) return null;
    if (json['status'] == 'cancelled') return null;
    String? text(Object? value) =>
        value is String && value.trim().isNotEmpty ? value.trim() : null;
    return ClassSession(
      id: id,
      groupId: groupId,
      startsAt: startsAt.toLocal(),
      endsAt: endsAt.toLocal(),
      groupName: text(json['groupName']),
      title: text(json['title']),
    );
  }

  final String id;
  final String groupId;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? groupName;
  final String? title;

  ClassSessionPhase phaseAt(DateTime now) {
    if (now.isBefore(startsAt)) return ClassSessionPhase.upcoming;
    if (now.isBefore(endsAt)) return ClassSessionPhase.inProgress;
    return ClassSessionPhase.done;
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'groupId': groupId,
    'startsAt': startsAt.toUtc().toIso8601String(),
    'endsAt': endsAt.toUtc().toIso8601String(),
    'groupName': groupName,
    'title': title,
  };

  @override
  List<Object?> get props => [id, groupId, startsAt, endsAt, groupName, title];
}

enum ClassSessionPhase { inProgress, upcoming, done }

/// In progress first, then upcoming by start, then finished ones.
List<ClassSession> orderTodaySessions(
  Iterable<ClassSession> sessions,
  DateTime now,
) {
  int rank(ClassSession session) => session.phaseAt(now).index;
  return [...sessions]..sort((a, b) {
    final byPhase = rank(a).compareTo(rank(b));
    if (byPhase != 0) return byPhase;
    final byStart = a.startsAt.compareTo(b.startsAt);
    return byStart != 0 ? byStart : a.id.compareTo(b.id);
  });
}
