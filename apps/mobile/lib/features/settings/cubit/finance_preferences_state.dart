import 'package:equatable/equatable.dart';

class FinancePreferencesState extends Equatable {
  const FinancePreferencesState({this.showAmounts = false});

  final bool showAmounts;

  FinancePreferencesState copyWith({bool? showAmounts}) {
    return FinancePreferencesState(
      showAmounts: showAmounts ?? this.showAmounts,
    );
  }

  @override
  List<Object?> get props => [showAmounts];
}
