import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

class ShellTitleOverrideRegistration extends Equatable {
  const ShellTitleOverrideRegistration({
    required this.ownerId,
    required this.locations,
    required this.title,
  });

  final String ownerId;
  final Set<String> locations;
  final String title;

  @override
  List<Object?> get props => [
    ownerId,
    locations.toList(growable: false)..sort(),
    title,
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
  }) {
    final nextRegistration = ShellTitleOverrideRegistration(
      ownerId: ownerId,
      locations: Set<String>.from(locations),
      title: title,
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
