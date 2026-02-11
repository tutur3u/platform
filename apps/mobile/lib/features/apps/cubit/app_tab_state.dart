import 'package:equatable/equatable.dart';

class AppTabState extends Equatable {
  const AppTabState({
    this.selectedId,
    this.hasSelection = false,
    this.shouldAutoFocus = false,
  });

  final String? selectedId;
  final bool hasSelection;
  final bool shouldAutoFocus;

  AppTabState copyWith({
    String? Function()? selectedId,
    bool? hasSelection,
    bool? shouldAutoFocus,
  }) {
    return AppTabState(
      selectedId: selectedId != null ? selectedId() : this.selectedId,
      hasSelection: hasSelection ?? this.hasSelection,
      shouldAutoFocus: shouldAutoFocus ?? this.shouldAutoFocus,
    );
  }

  @override
  List<Object?> get props => [selectedId, hasSelection, shouldAutoFocus];
}
