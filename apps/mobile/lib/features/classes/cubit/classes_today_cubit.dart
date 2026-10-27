import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';

enum ClassesTodayAccess { unknown, granted, denied }

enum ClassesTodayStatus { initial, loading, ready, error }

typedef ClassesTodayScheduler =
    Timer Function(Duration delay, void Function() callback);

class ClassesTodayState extends Equatable {
  const ClassesTodayState({
    this.userId,
    this.wsId,
    this.access = ClassesTodayAccess.unknown,
    this.status = ClassesTodayStatus.initial,
    this.snapshot,
    this.scope = defaultClassScope,
    this.tick = 0,
  });

  final String? userId;
  final String? wsId;
  final ClassesTodayAccess access;
  final ClassesTodayStatus status;

  /// The last authorized snapshot for this scope, kept through errors.
  final ClassesTodaySnapshot? snapshot;
  final ClassScope scope;

  /// Advances when a session starts or ends, so phases re-render.
  final int tick;

  bool get scopeSupported => snapshot?.scopeSupported ?? false;

  /// The scope actually applied: "mine" needs a source that supports it.
  ClassScope get effectiveScope => scopeSupported ? scope : ClassScope.all;

  ClassesTodayState copyWith({
    ClassesTodayAccess? access,
    ClassesTodayStatus? status,
    ClassesTodaySnapshot? snapshot,
    ClassScope? scope,
    int? tick,
  }) => ClassesTodayState(
    userId: userId,
    wsId: wsId,
    access: access ?? this.access,
    status: status ?? this.status,
    snapshot: snapshot ?? this.snapshot,
    scope: scope ?? this.scope,
    tick: tick ?? this.tick,
  );

  @override
  List<Object?> get props => [
    userId,
    wsId,
    access,
    status,
    snapshot,
    scope,
    tick,
  ];
}

/// Today's class sessions for the signed-in account in one workspace.
///
/// Access follows the server: a denial clears the data, while any other
/// failure keeps the last snapshot and reports an error. A timer re-renders
/// at each session boundary and reloads after midnight.
class ClassesTodayCubit extends Cubit<ClassesTodayState> {
  ClassesTodayCubit({
    required ClassesTodayRepository repository,
    DateTime Function()? clock,
    ClassesTodayScheduler? scheduler,
  }) : _repository = repository,
       _clock = clock ?? DateTime.now,
       _schedule = scheduler ?? Timer.new,
       super(const ClassesTodayState());

  final ClassesTodayRepository _repository;
  final DateTime Function() _clock;
  final ClassesTodayScheduler _schedule;
  int _generation = 0;
  DateTime? _day;
  Timer? _timer;

  DateTime get now => _clock();

  Future<void> load({required String? userId, required String? wsId}) async {
    if (userId == null || wsId == null || userId.isEmpty || wsId.isEmpty) {
      _generation++;
      _cancelTimer();
      _day = null;
      emit(const ClassesTodayState());
      return;
    }
    final day = _dateOf(_clock());
    final generation = ++_generation;
    if (userId != state.userId || wsId != state.wsId || day != _day) {
      _day = day;
      final peeked = _safePeek(userId, wsId, day);
      // A snapshot is only stored after an authorized read.
      emit(
        ClassesTodayState(
          userId: userId,
          wsId: wsId,
          access: peeked == null
              ? ClassesTodayAccess.unknown
              : ClassesTodayAccess.granted,
          status: peeked == null
              ? ClassesTodayStatus.loading
              : ClassesTodayStatus.ready,
          snapshot: peeked,
          scope: state.scope,
        ),
      );
      _scheduleTick();
    } else if (state.snapshot == null) {
      emit(state.copyWith(status: ClassesTodayStatus.loading));
    }

    try {
      final snapshot = await _repository.fetch(
        userId: userId,
        wsId: wsId,
        day: day,
        scope: state.scope,
      );
      if (isClosed || generation != _generation) return;
      emit(
        state.copyWith(
          access: ClassesTodayAccess.granted,
          status: ClassesTodayStatus.ready,
          snapshot: snapshot,
        ),
      );
      _scheduleTick();
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      if (isClassesAccessDenied(error)) {
        _cancelTimer();
        emit(
          ClassesTodayState(
            userId: userId,
            wsId: wsId,
            access: ClassesTodayAccess.denied,
            status: ClassesTodayStatus.ready,
            scope: state.scope,
          ),
        );
        await _repository.forget(userId: userId, wsId: wsId, day: day);
        return;
      }
      emit(state.copyWith(status: ClassesTodayStatus.error));
    }
  }

  Future<void> refresh() => load(userId: state.userId, wsId: state.wsId);

  Future<void> setScope(ClassScope scope) async {
    if (scope == state.scope) return;
    emit(state.copyWith(scope: scope));
    if (state.scopeSupported) await refresh();
  }

  List<ClassSession> orderedSessions() =>
      orderTodaySessions(state.snapshot?.sessions ?? const [], now);

  /// Wakes at the next session start or end, or at midnight.
  void _scheduleTick() {
    _cancelTimer();
    if (isClosed || state.wsId == null) return;
    final current = _clock();
    var next = _dateOf(current).add(const Duration(days: 1));
    for (final session in state.snapshot?.sessions ?? const <ClassSession>[]) {
      for (final edge in [session.startsAt, session.endsAt]) {
        if (edge.isAfter(current) && edge.isBefore(next)) next = edge;
      }
    }
    _timer = _schedule(next.difference(current), _onTick);
  }

  void _onTick() {
    if (isClosed || state.wsId == null) return;
    if (_dateOf(_clock()) != _day) {
      unawaited(refresh());
      return;
    }
    emit(state.copyWith(tick: state.tick + 1));
    _scheduleTick();
  }

  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  static DateTime _dateOf(DateTime value) =>
      DateTime(value.year, value.month, value.day);

  ClassesTodaySnapshot? _safePeek(String userId, String wsId, DateTime day) {
    try {
      return _repository.peek(userId: userId, wsId: wsId, day: day);
    } on Object {
      return null;
    }
  }

  @override
  Future<void> close() {
    _cancelTimer();
    return super.close();
  }
}
