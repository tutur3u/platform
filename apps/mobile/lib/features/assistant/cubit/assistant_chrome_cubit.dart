import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

class AssistantChromeCubit extends Cubit<AssistantChromeState> {
  AssistantChromeCubit() : super(const AssistantChromeState());

  void enterFullscreen() {
    emit(state.copyWith(isFullscreen: true));
  }

  void exitFullscreen() {
    emit(state.copyWith(isFullscreen: false));
  }

  void setFullscreen({required bool value}) {
    emit(state.copyWith(isFullscreen: value));
  }

  void toggleFullscreen() {
    emit(state.copyWith(isFullscreen: !state.isFullscreen));
  }
}

class AssistantChromeState extends Equatable {
  const AssistantChromeState({this.isFullscreen = false});

  final bool isFullscreen;

  AssistantChromeState copyWith({bool? isFullscreen}) {
    return AssistantChromeState(
      isFullscreen: isFullscreen ?? this.isFullscreen,
    );
  }

  @override
  List<Object?> get props => [isFullscreen];
}
