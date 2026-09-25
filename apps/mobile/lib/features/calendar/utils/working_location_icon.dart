import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';

IconData workingLocationIcon(WorkingLocationKind kind) => switch (kind) {
  WorkingLocationKind.home => Icons.home_outlined,
  WorkingLocationKind.office => Icons.business_outlined,
  WorkingLocationKind.school => Icons.school_outlined,
  WorkingLocationKind.custom => Icons.place_outlined,
};
