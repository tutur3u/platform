import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

class ShellTitleOverrideRegistration extends Equatable {
  const ShellTitleOverrideRegistration({
    required this.ownerId,
    required this.locations,
    required this.title,
    required this.showLeadingBrand,
    required this.showAvatar,
    this.onTitleSubmitted,
  });

  final String ownerId;
  final Set<String> locations;
  final String title;
  final bool showLeadingBrand;
  final bool showAvatar;
  final Future<void> Function(String title)? onTitleSubmitted;

  bool get canEditTitle => onTitleSubmitted != null;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    title,
    showLeadingBrand,
    showAvatar,
    canEditTitle,
  ];
}

class ShellTitleOverrideState extends Equatable {
  const ShellTitleOverrideState({
    this.registrations = const <String, ShellTitleOverrideRegistration>{},
  });

  final Map<String, ShellTitleOverrideRegistration> registrations;

  String? resolveForLocation(String matchedLocation) {
    String? resolved;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration.title;
      }
    }
    return resolved;
  }

  bool showLeadingBrandForLocation(String matchedLocation) {
    var resolved = true;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration.showLeadingBrand;
      }
    }
    return resolved;
  }

  bool showAvatarForLocation(String matchedLocation) {
    var resolved = true;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration.showAvatar;
      }
    }
    return resolved;
  }

  bool canEditTitleForLocation(String matchedLocation) {
    var resolved = false;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration.canEditTitle;
      }
    }
    return resolved;
  }

  Future<void> Function(String title)? titleSubmitterForLocation(
    String matchedLocation,
  ) {
    Future<void> Function(String title)? resolved;
    for (final registration in registrations.values) {
      if (registration.locations.contains(matchedLocation)) {
        resolved = registration.onTitleSubmitted;
      }
    }
    return resolved;
  }

  ShellTitleOverrideState copyWith({
    Map<String, ShellTitleOverrideRegistration>? registrations,
  }) {
    return ShellTitleOverrideState(
      registrations: registrations ?? this.registrations,
    );
  }

  @override
  List<Object?> get props => [registrations.values.toList(growable: false)];
}

class ShellTitleOverrideCubit extends Cubit<ShellTitleOverrideState> {
  ShellTitleOverrideCubit() : super(const ShellTitleOverrideState());

  void register({
    required String registrationId,
    required String ownerId,
    required Set<String> locations,
    required String title,
    bool showLeadingBrand = true,
    bool showAvatar = true,
    Future<void> Function(String title)? onTitleSubmitted,
  }) {
    final nextRegistration = ShellTitleOverrideRegistration(
      ownerId: ownerId,
      locations: Set<String>.from(locations),
      title: title,
      showLeadingBrand: showLeadingBrand,
      showAvatar: showAvatar,
      onTitleSubmitted: onTitleSubmitted,
    );
    final currentRegistration = state.registrations[registrationId];
    if (currentRegistration == nextRegistration) {
      return;
    }

    emit(
      state.copyWith(
        registrations: <String, ShellTitleOverrideRegistration>{
          ...state.registrations,
          registrationId: nextRegistration,
        },
      ),
    );
  }

  void unregister(String registrationId) {
    if (!state.registrations.containsKey(registrationId)) {
      return;
    }

    final nextRegistrations = Map<String, ShellTitleOverrideRegistration>.from(
      state.registrations,
    )..remove(registrationId);
    emit(state.copyWith(registrations: nextRegistrations));
  }
}
