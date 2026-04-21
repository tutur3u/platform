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

  void enterLiveMode() {
    emit(state.copyWith(isLiveMode: true, isFullscreen: true));
  }

  void exitLiveMode() {
    emit(state.copyWith(isLiveMode: false, isFullscreen: false));
  }

  void setLiveMode({required bool value}) {
    emit(
      state.copyWith(
        isLiveMode: value,
        isFullscreen: value,
      ),
    );
  }
}

class AssistantChromeState extends Equatable {
  const AssistantChromeState({
    this.isFullscreen = false,
    this.isLiveMode = false,
  });

  final bool isFullscreen;
  final bool isLiveMode;

  AssistantChromeState copyWith({
    bool? isFullscreen,
    bool? isLiveMode,
  }) {
    return AssistantChromeState(
      isFullscreen: isFullscreen ?? this.isFullscreen,
      isLiveMode: isLiveMode ?? this.isLiveMode,
    );
  }

  @override
  List<Object?> get props => [isFullscreen, isLiveMode];
}
