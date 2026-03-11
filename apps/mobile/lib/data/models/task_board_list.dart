import 'package:equatable/equatable.dart';

class TaskBoardList extends Equatable {
  const TaskBoardList({
    required this.id,
    required this.boardId,
    this.name,
    this.status,
    this.color,
    this.position,
    this.archived = false,
  });

  factory TaskBoardList.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    if (rawId is! String || rawId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardList.fromJson: required field "id" is missing or invalid',
      );
    }

    final rawBoardId = json['board_id'];
    if (rawBoardId is! String || rawBoardId.trim().isEmpty) {
      throw const FormatException(
        'TaskBoardList.fromJson: required field "board_id" '
        'is missing or invalid',
      );
    }

    return TaskBoardList(
      id: rawId.trim(),
      boardId: rawBoardId.trim(),
      name: (json['name'] as String?)?.trim(),
      status: (json['status'] as String?)?.trim(),
      color: (json['color'] as String?)?.trim(),
      position: _parsePosition(json['position']),
      archived: json['archived'] as bool? ?? false,
    );
  }

  static int? _parsePosition(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  final String id;
  final String boardId;
  final String? name;
  final String? status;
  final String? color;
  final int? position;
  final bool archived;

  bool get isDone => status == 'done';

  @override
  List<Object?> get props => [
    id,
    boardId,
    name,
    status,
    color,
    position,
    archived,
  ];
}
