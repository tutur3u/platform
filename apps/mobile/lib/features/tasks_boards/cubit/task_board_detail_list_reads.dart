part of 'task_board_detail_cubit.dart';

/// Tracks which in-flight list read owns each list's loading guard.
///
/// A read that is dropped (a move or reload bumped the request token) must
/// release the guard it set, or a failed board refresh leaves the list stuck
/// as loading and later refreshes and Timeline paging skip it. A newer read
/// that took over the guard is never released by an older one.
mixin _TaskBoardListReadGuard on Cubit<TaskBoardDetailState> {
  int _listReadSequence = 0;
  final Map<String, int> _listReadOwners = <String, int>{};

  /// Claims [listId]'s loading guard for a new read and returns its id.
  int _beginListRead(String listId) =>
      _listReadOwners[listId] = ++_listReadSequence;

  /// Ends the read [readId] of [listId]. Applied reads already cleared their
  /// loading flag; a dropped read still holds it, so release it here unless a
  /// newer read owns it.
  void _finishListRead(String listId, int readId) {
    if (_listReadOwners[listId] != readId) {
      return;
    }
    _listReadOwners.remove(listId);
    if (isClosed || !state.loadingListIds.contains(listId)) {
      return;
    }
    emit(
      state.copyWith(loadingListIds: {...state.loadingListIds}..remove(listId)),
    );
  }
}
