import 'package:equatable/equatable.dart';

class WorkspaceLimits extends Equatable {
  const WorkspaceLimits({
    required this.canCreate,
    required this.currentCount,
    required this.limit,
    this.remaining,
  });

  factory WorkspaceLimits.fromJson(Map<String, dynamic> json) =>
      WorkspaceLimits(
        canCreate: json['canCreate'] as bool? ?? false,
        currentCount: json['currentCount'] as int? ?? 0,
        limit: json['limit'] as int? ?? 0,
        remaining: json['remaining'] as int?,
      );

  final bool canCreate;
  final int currentCount;
  final int limit;
  final int? remaining;

  @override
  List<Object?> get props => [canCreate, currentCount, limit, remaining];
}
