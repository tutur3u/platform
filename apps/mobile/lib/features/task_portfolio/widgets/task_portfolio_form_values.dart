import 'package:flutter/material.dart';

@immutable
class TaskProjectFormValue {
  const TaskProjectFormValue({
    required this.name,
    required this.description,
    this.status,
    this.priority,
    this.healthStatus,
    this.leadId,
    this.startDate,
    this.endDate,
    this.archived,
  });

  final String name;
  final String? description;
  final String? status;
  final String? priority;
  final String? healthStatus;
  final String? leadId;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool? archived;
}

@immutable
class TaskInitiativeFormValue {
  const TaskInitiativeFormValue({
    required this.name,
    required this.description,
    required this.status,
  });

  final String name;
  final String? description;
  final String status;
}
