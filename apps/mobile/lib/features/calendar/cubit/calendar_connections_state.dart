import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/calendar_account.dart';
import 'package:mobile/data/models/calendar_connection.dart';

enum CalendarConnectionsStatus { initial, loading, loaded, error }

class CalendarConnectionsState extends Equatable {
  const CalendarConnectionsState({
    this.status = CalendarConnectionsStatus.initial,
    this.accounts = const [],
    this.connections = const [],
    this.error,
    this.togglingIds = const {},
    this.disconnectingId,
  });

  final CalendarConnectionsStatus status;
  final List<CalendarAccount> accounts;
  final List<CalendarConnection> connections;
  final String? error;

  /// Connection IDs currently being toggled (for optimistic UI).
  final Set<String> togglingIds;

  /// Account ID currently being disconnected.
  final String? disconnectingId;

  /// Connections grouped by account ID (via `authTokenId`).
  Map<String, List<CalendarConnection>> get connectionsByAccount {
    final map = <String, List<CalendarConnection>>{};
    for (final c in connections) {
      final key = c.authTokenId ?? '';
      (map[key] ??= []).add(c);
    }
    return map;
  }

  CalendarConnectionsState copyWith({
    CalendarConnectionsStatus? status,
    List<CalendarAccount>? accounts,
    List<CalendarConnection>? connections,
    String? error,
    Set<String>? togglingIds,
    String? disconnectingId,
    bool clearDisconnecting = false,
  }) {
    return CalendarConnectionsState(
      status: status ?? this.status,
      accounts: accounts ?? this.accounts,
      connections: connections ?? this.connections,
      error: error,
      togglingIds: togglingIds ?? this.togglingIds,
      disconnectingId: clearDisconnecting
          ? null
          : (disconnectingId ?? this.disconnectingId),
    );
  }

  @override
  List<Object?> get props => [
    status,
    accounts,
    connections,
    error,
    togglingIds,
    disconnectingId,
  ];
}
