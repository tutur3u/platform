import 'package:mobile/features/mastermind/catchup/catchup_visit.dart';

/// What Catch-up remembers while the app process lives, so leaving Today for
/// another tab and coming back keeps the window and the collapsed groups.
final class CatchupSession {
  CatchupSession({CatchupVisitTracker? tracker})
    : tracker = tracker ?? CatchupVisitTracker();

  /// The default session, shared by every Today mount.
  static CatchupSession shared = CatchupSession();

  final CatchupVisitTracker tracker;
  final Set<String> _collapsed = {};
  bool showEarlier = false;

  bool isCollapsed(String key) => _collapsed.contains(key);

  void setCollapsed(String key, {required bool collapsed}) {
    if (collapsed) {
      _collapsed.add(key);
    } else {
      _collapsed.remove(key);
    }
  }
}
