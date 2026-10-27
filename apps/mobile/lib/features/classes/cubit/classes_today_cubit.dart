import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/classes/data/class_session.dart';
import 'package:mobile/features/classes/data/classes_today_repository.dart';

enum ClassesTodayAccess { unknown, granted, denied }

enum ClassesTodayStatus { initial, loading, ready, error }

class ClassesTodayState extends Equatable {
  const ClassesTodayState({
    this.userId,
    this.wsId,
    this.access = ClassesTodayAccess.unknown,
    this.status = ClassesTodayStatus.initial,
    this.snapshot,
    this.scope = defaultClassScope,
  });

  final String? userId;
  final String? wsId;
  final ClassesTodayAccess access;
  final ClassesTodayStatus status;

  /// The last authorized snapshot for this scope, kept through errors.
  final ClassesTodaySnapshot? snapshot;
  final ClassScope scope;

  bool get scopeSupported => snapshot?.scopeSupported ?? false;

  /// The scope actually applied: "mine" needs a source that supports it.
  ClassScope get effectiveScope => scopeSupported ? scope : ClassScope.all;

  ClassesTodayState copyWith({
    ClassesTodayAccess? access,
    ClassesTodayStatus? status,
    ClassesTodaySnapshot? snapshot,
    ClassScope? scope,
  }) => ClassesTodayState(
    userId: userId,
    wsId: wsId,
    access: access ?? this.access,
    status: status ?? this.status,
    snapshot: snapshot ?? this.snapshot,
    scope: scope ?? this.scope,
  );

  @override
  List<Object?> get props => [userId, wsId, access, status, snapshot, scope];
}

/// Today's class sessions for the signed-in account in one workspace.
class ClassesTodayCubit extends Cubit<ClassesTodayState> {
  ClassesTodayCubit({
    required ClassesTodayRepository repository,
    DateTime Function()? clock,
  }) : _repository = repository,
       _clock = clock ?? DateTime.now,
       super(const ClassesTodayState());

  final ClassesTodayRepository _repository;
  final DateTime Function() _clock;
  int _generation = 0;

  Future<void> load({required String? userId, required String? wsId}) async {
    if (userId == null || wsId == null || userId.isEmpty || wsId.isEmpty) {
      _generation++;
      emit(const ClassesTodayState());
      return;
    }
    final day = _clock();
    final generation = ++_generation;
    if (userId != state.userId || wsId != state.wsId) {
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
    } else if (state.snapshot == null) {
      emit(state.copyWith(status: ClassesTodayStatus.loading));
    }

    bool allowed;
    try {
      allowed = await _repository.canViewClasses(wsId);
    } on Object {
      allowed = false;
    }
    if (isClosed || generation != _generation) return;
    if (!allowed) {
      emit(
        ClassesTodayState(
          userId: userId,
          wsId: wsId,
          access: ClassesTodayAccess.denied,
          status: ClassesTodayStatus.ready,
          scope: state.scope,
        ),
      );
      return;
    }
    if (state.access != ClassesTodayAccess.granted) {
      emit(state.copyWith(access: ClassesTodayAccess.granted));
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
        state.copyWith(status: ClassesTodayStatus.ready, snapshot: snapshot),
      );
    } on Object {
      if (isClosed || generation != _generation) return;
      emit(state.copyWith(status: ClassesTodayStatus.error));
    }
  }

  Future<void> refresh() => load(userId: state.userId, wsId: state.wsId);

  Future<void> setScope(ClassScope scope) async {
    if (scope == state.scope) return;
    emit(state.copyWith(scope: scope));
    if (state.scopeSupported) await refresh();
  }

  DateTime get now => _clock();

  List<ClassSession> orderedSessions() =>
      orderTodaySessions(state.snapshot?.sessions ?? const [], now);

  ClassesTodaySnapshot? _safePeek(String userId, String wsId, DateTime day) {
    try {
      return _repository.peek(userId: userId, wsId: wsId, day: day);
    } on Object {
      return null;
    }
  }
}
