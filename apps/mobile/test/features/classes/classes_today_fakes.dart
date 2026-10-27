import 'dart:async';

import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';

class FakeClassesTodayRepository implements ClassesTodayRepository {
  FakeClassesTodayRepository({
    this.allowed = true,
    this.snapshot = const ClassesTodaySnapshot(sessions: []),
  });

  bool allowed;
  ClassesTodaySnapshot snapshot;
  ClassesTodaySnapshot? cached;
  Exception? error;
  Completer<void>? gate;
  final List<String> fetches = [];

  @override
  ClassesTodaySnapshot? peek({
    required String userId,
    required String wsId,
    required DateTime day,
  }) => cached;

  @override
  Future<bool> canViewClasses(String wsId) async => allowed;

  @override
  Future<ClassesTodaySnapshot> fetch({
    required String userId,
    required String wsId,
    required DateTime day,
    required ClassScope scope,
  }) async {
    fetches.add('$userId/$wsId/${scope.name}');
    await gate?.future;
    if (error case final error?) throw error;
    return snapshot;
  }
}

ClassSession session(
  String id, {
  required DateTime start,
  Duration length = const Duration(minutes: 90),
  String? groupName,
  String? title,
}) => ClassSession(
  id: id,
  groupId: 'g-$id',
  startsAt: start,
  endsAt: start.add(length),
  groupName: groupName ?? 'Class $id',
  title: title,
);
