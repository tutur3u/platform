part of 'snapshot.dart';

final class SpeedPoint {
  const SpeedPoint({
    required this.model,
    required this.t,
    required this.tokSP50,
  });

  final String model;
  final DateTime t;
  final double tokSP50;
}

final class ChildrenPoint {
  const ChildrenPoint({
    required this.t,
    required this.provider,
    required this.model,
    required this.running,
    required this.started,
    required this.finished,
  });

  final DateTime t;
  final String provider;
  final String model;
  final int running;
  final int started;
  final int finished;
}

final class Staff {
  const Staff({
    required this.role,
    required this.title,
    required this.state,
    required this.model,
  });

  final String role;
  final String title;
  final LaneState state;
  final String model;
}
