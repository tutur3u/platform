import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

class AssistantChromeCubit extends Cubit<AssistantChromeState> {
  AssistantChromeCubit() : super(const AssistantChromeState());

  void toggleComposerNavigation() {
    if (state.isLiveMode) {
      emit(state.copyWith(navigationExpanded: !state.navigationExpanded));
    }
  }

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
    emit(
      state.copyWith(
        navigationExpanded: false,
        isLiveMode: true,
        isFullscreen: false,
        hasSelectedMode: true,
      ),
    );
  }

  void exitLiveMode() {
    emit(
      state.copyWith(
        isLiveMode: false,
        navigationExpanded: false,
        isFullscreen: false,
        hasSelectedMode: true,
      ),
    );
  }

  void setLiveMode({required bool value}) {
    emit(
      state.copyWith(
        navigationExpanded: false,
        isLiveMode: value,
        isFullscreen: false,
        hasSelectedMode: true,
      ),
    );
  }
}

class AssistantChromeState extends Equatable {
  const AssistantChromeState({
    this.navigationExpanded = false,
    this.isFullscreen = false,
    this.isLiveMode = false,
    this.hasSelectedMode = false,
  });

  final bool navigationExpanded;
  final bool isFullscreen;
  final bool isLiveMode;
  final bool hasSelectedMode;

  AssistantChromeState copyWith({
    bool? navigationExpanded,
    bool? isFullscreen,
    bool? isLiveMode,
    bool? hasSelectedMode,
  }) {
    return AssistantChromeState(
      navigationExpanded: navigationExpanded ?? this.navigationExpanded,
      isFullscreen: isFullscreen ?? this.isFullscreen,
      isLiveMode: isLiveMode ?? this.isLiveMode,
      hasSelectedMode: hasSelectedMode ?? this.hasSelectedMode,
    );
  }

  @override
  List<Object?> get props => [
    navigationExpanded,
    isFullscreen,
    isLiveMode,
    hasSelectedMode,
  ];
}
