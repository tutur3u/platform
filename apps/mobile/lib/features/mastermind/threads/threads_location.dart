import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

/// Lane states in the order Threads lists them: waiting on someone first, then
/// failed, then running, and idle last.
const List<LaneState> threadStatePriority = [
  LaneState.waiting,
  LaneState.failed,
  LaneState.running,
  LaneState.queued,
  LaneState.idle,
  LaneState.stale,
  LaneState.completed,
  LaneState.cancelled,
  LaneState.open,
  LaneState.answered,
  LaneState.withdrawn,
  LaneState.unknown,
];

/// The Threads location for a segment and the lane filters, the same query
/// Work carries so a Work or Home link keeps its filters.
String threadsLocation({
  WorkSegment segment = WorkSegment.lanes,
  LaneState? state,
  Product? product,
  Area? area,
}) {
  final query = {
    if (segment != WorkSegment.lanes) 'segment': segment.queryValue,
    'state': ?state?.wireName,
    'product': ?product?.wireName,
    'area': ?area?.wireName,
  };
  return Uri(
    path: '/mastermind/threads',
    queryParameters: query.isEmpty ? null : query,
  ).toString();
}
