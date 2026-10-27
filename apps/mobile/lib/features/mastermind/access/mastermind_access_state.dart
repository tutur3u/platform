import 'package:equatable/equatable.dart';

enum MastermindAccessStatus { initial, loading, loaded, error }

final class MastermindAccessState extends Equatable {
  const MastermindAccessState({
    this.status = MastermindAccessStatus.initial,
    this.enabled = false,
    this.wsId,
  });
  final MastermindAccessStatus status;
  final bool enabled;
  final String? wsId;
  @override
  List<Object?> get props => [status, enabled, wsId];
}
