import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/time_tracking/category.dart';

class TimeTrackingGoal extends Equatable {
  const TimeTrackingGoal({
    required this.id,
    required this.wsId,
    required this.userId,
    required this.dailyGoalMinutes,
    this.categoryId,
    this.weeklyGoalMinutes,
    this.isActive = true,
    this.category,
  });

  factory TimeTrackingGoal.fromJson(Map<String, dynamic> json) {
    final categoryData = json['category'];
    return TimeTrackingGoal(
      id: json['id'] as String,
      wsId: json['ws_id'] as String,
      userId: json['user_id'] as String,
      categoryId: json['category_id'] as String?,
      dailyGoalMinutes: (json['daily_goal_minutes'] as num?)?.toInt() ?? 0,
      weeklyGoalMinutes: (json['weekly_goal_minutes'] as num?)?.toInt(),
      isActive: json['is_active'] as bool? ?? true,
      category: categoryData is Map<String, dynamic>
          ? TimeTrackingCategory.fromJson(categoryData)
          : null,
    );
  }

  final String id;
  final String wsId;
  final String userId;
  final String? categoryId;
  final int dailyGoalMinutes;
  final int? weeklyGoalMinutes;
  final bool isActive;
  final TimeTrackingCategory? category;

  @override
  List<Object?> get props => [
    id,
    wsId,
    userId,
    categoryId,
    dailyGoalMinutes,
    weeklyGoalMinutes,
    isActive,
    category,
  ];
}
