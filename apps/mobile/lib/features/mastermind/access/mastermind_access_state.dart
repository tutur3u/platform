import 'package:equatable/equatable.dart';

enum MastermindAccessStatus { initial, loading, loaded, error }

final class MastermindAccessState extends Equatable {
  const MastermindAccessState({
    this.status = MastermindAccessStatus.initial,
    this.enabled = false,
    this.forbidden = false,
    this.wsId,
  });
  final MastermindAccessStatus status;
  final bool enabled;

  /// The hub answered 403 for this account. Hides the entry until the next
  /// access sync, but leaves [enabled] alone so an open screen can still
  /// explain itself instead of being redirected away.
  final bool forbidden;
  final String? wsId;

  /// Whether the Apps hub offers Mastermind.
  bool get visible => enabled && !forbidden;

  @override
  List<Object?> get props => [status, enabled, forbidden, wsId];
}
