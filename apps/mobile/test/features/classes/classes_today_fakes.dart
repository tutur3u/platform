import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';

/// The server denies `view_user_groups` with 403.
const accessDenied = ApiException(message: 'Forbidden', statusCode: 403);

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
  final List<String> forgotten = [];

  @override
  ClassesTodaySnapshot? peek({
    required String userId,
    required String wsId,
    required DateTime day,
  }) => cached;

  @override
  Future<ClassesTodaySnapshot> fetch({
    required String userId,
    required String wsId,
    required DateTime day,
    required ClassScope scope,
  }) async {
    fetches.add('$userId/$wsId/${scope.name}');
    await gate?.future;
    if (!allowed) throw accessDenied;
    if (error case final error?) throw error;
    return snapshot;
  }

  @override
  Future<void> forget({
    required String userId,
    required String wsId,
    required DateTime day,
  }) async {
    cached = null;
    forgotten.add('$userId/$wsId');
  }
}

/// Captures scheduled ticks instead of starting real timers.
class FakeTickScheduler {
  final List<(Duration, void Function())> scheduled = [];

  Timer call(Duration delay, void Function() callback) {
    scheduled.add((delay, callback));
    return _InertTimer();
  }

  void fireLast() => scheduled.last.$2();
}

class _InertTimer implements Timer {
  @override
  bool get isActive => false;

  @override
  int get tick => 0;

  @override
  void cancel() {}
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
