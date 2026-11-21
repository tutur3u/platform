import 'dart:async';

import 'package:mobile/features/mastermind/fleet/data/fleet_owner_live.dart';

/// One owner socket shared by the Projects list and the thread pushed over
/// it. It runs while any foreground holder wants it and closes with the
/// last one, so a pushed thread never opens a second connection.
class ProjectsLive {
  /// The connect callback opens the socket; tests pass one that never
  /// dials out.
  ProjectsLive(this._connect);

  static ProjectsLive shared = ProjectsLive((onFrame) {
    final live = FleetOwnerLive(onFrame: onFrame);
    return (start: live.start, stop: live.stop);
  });

  final ProjectsLiveConnection Function(void Function(FleetOwnerFrame))
  _connect;
  final _frames = StreamController<FleetOwnerFrame>.broadcast();
  final _holders = <Object>{};
  ProjectsLiveConnection? _live;

  Stream<FleetOwnerFrame> get frames => _frames.stream;

  void hold(Object holder) {
    if (!_holders.add(holder) || _holders.length > 1) return;
    (_live ??= _connect(_frames.add)).start();
  }

  void release(Object holder) {
    if (!_holders.remove(holder) || _holders.isNotEmpty) return;
    _live?.stop();
  }
}

typedef ProjectsLiveConnection = ({
  void Function() start,
  void Function() stop,
});

/// Whether [frame] says threads changed on [machineId].
bool isThreadsPoke(FleetOwnerFrame frame, String? machineId) =>
    frame.kind == FleetOwnerFrameKind.poke &&
    frame.payload['topic'] == 'threads' &&
    frame.payload['machineId'] == machineId;
