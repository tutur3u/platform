import 'package:equatable/equatable.dart';

class AppTabState extends Equatable {
  const AppTabState({
    this.selectedId,
    this.shouldAutoFocus = false,
  });

  final String? selectedId;
  final bool shouldAutoFocus;

  bool get hasSelection => selectedId != null;

  AppTabState copyWith({
    String? Function()? selectedId,
    bool? shouldAutoFocus,
  }) {
    return AppTabState(
      selectedId: selectedId != null ? selectedId() : this.selectedId,
      shouldAutoFocus: shouldAutoFocus ?? this.shouldAutoFocus,
    );
  }

  @override
  List<Object?> get props => [selectedId, shouldAutoFocus];
}
