import 'package:equatable/equatable.dart';

class AppTabState extends Equatable {
  const AppTabState({
    this.selectedId,
    this.hasSelection = false,
  });

  final String? selectedId;
  final bool hasSelection;

  AppTabState copyWith({
    String? selectedId,
    bool? hasSelection,
  }) {
    return AppTabState(
      selectedId: selectedId ?? this.selectedId,
      hasSelection: hasSelection ?? this.hasSelection,
    );
  }

  @override
  List<Object?> get props => [selectedId, hasSelection];
}
