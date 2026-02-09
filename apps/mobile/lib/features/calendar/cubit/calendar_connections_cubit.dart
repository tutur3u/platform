import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/calendar_connections_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/calendar/cubit/calendar_connections_state.dart';
import 'package:url_launcher/url_launcher.dart';

/// Manages the state of calendar account connections and calendar visibility.
class CalendarConnectionsCubit extends Cubit<CalendarConnectionsState> {
  CalendarConnectionsCubit({
    CalendarConnectionsRepository? repository,
  }) : _repo = repository ?? CalendarConnectionsRepository(),
       super(const CalendarConnectionsState());

  final CalendarConnectionsRepository _repo;

  /// Loads both accounts and connections for the given workspace.
  Future<void> load(String wsId) async {
    emit(state.copyWith(status: CalendarConnectionsStatus.loading));
    try {
      final accounts = await _repo.getAccounts(wsId);
      final connections = await _repo.getConnections(wsId);
      emit(
        state.copyWith(
          status: CalendarConnectionsStatus.loaded,
          accounts: accounts,
          connections: connections,
        ),
      );
    } on Exception catch (e) {
      final message = e is ApiException ? e.message : e.toString();
      emit(
        state.copyWith(
          status: CalendarConnectionsStatus.error,
          error: message,
        ),
      );
    }
  }

  /// Toggles a calendar connection's visibility with optimistic UI.
  Future<void> toggleConnection(
    String connectionId, {
    required bool enabled,
  }) async {
    // Optimistic update.
    final updatedConnections = state.connections.map((c) {
      if (c.id == connectionId) return c.copyWith(isEnabled: enabled);
      return c;
    }).toList();

    emit(
      state.copyWith(
        connections: updatedConnections,
        togglingIds: {...state.togglingIds, connectionId},
      ),
    );

    try {
      await _repo.toggleConnection(
        connectionId: connectionId,
        isEnabled: enabled,
      );
    } on ApiException {
      // Rollback on error.
      final rolledBack = state.connections.map((c) {
        if (c.id == connectionId) return c.copyWith(isEnabled: !enabled);
        return c;
      }).toList();
      emit(state.copyWith(connections: rolledBack));
    } finally {
      emit(
        state.copyWith(
          togglingIds: state.togglingIds
              .where((id) => id != connectionId)
              .toSet(),
        ),
      );
    }
  }

  /// Soft-deletes an account and disables its calendar connections locally.
  Future<void> disconnectAccount(String accountId, String wsId) async {
    emit(state.copyWith(disconnectingId: accountId));
    try {
      await _repo.disconnectAccount(accountId: accountId, wsId: wsId);

      // Remove account and disable associated connections locally.
      final accounts = state.accounts.where((a) => a.id != accountId).toList();
      final connections = state.connections.map((c) {
        if (c.authTokenId == accountId) {
          return c.copyWith(isEnabled: false);
        }
        return c;
      }).toList();

      emit(
        state.copyWith(
          accounts: accounts,
          connections: connections,
          clearDisconnecting: true,
        ),
      );
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message, clearDisconnecting: true));
    }
  }

  /// Opens the Google OAuth URL in the system browser.
  Future<bool> connectGoogle(String wsId) async {
    try {
      final url = await _repo.getGoogleOAuthUrl(wsId);
      return launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } on ApiException {
      return false;
    }
  }

  /// Opens the Microsoft OAuth URL in the system browser.
  Future<bool> connectMicrosoft(String wsId) async {
    try {
      final url = await _repo.getMicrosoftOAuthUrl(wsId);
      return launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } on ApiException {
      return false;
    }
  }

  @override
  Future<void> close() {
    _repo.dispose();
    return super.close();
  }
}
