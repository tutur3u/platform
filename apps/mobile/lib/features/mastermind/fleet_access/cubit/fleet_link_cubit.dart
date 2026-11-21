import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';

/// Where the person is in linking a private desk conversation:
/// take a code ([issued]), send it to the desk, enter the link id and
/// confirmation code the desk replies with to read the pending link
/// ([pending]), then confirm it ([linked]).
enum FleetLinkStep { idle, issued, pending, linked }

final class FleetLinkState extends Equatable {
  const FleetLinkState({
    this.step = FleetLinkStep.idle,
    this.busy = false,
    this.code,
    this.preview,
    this.linkId,
    this.confirmationCode,
    this.failure,
  });

  final FleetLinkStep step;
  final bool busy;
  final FleetLinkCode? code;
  final FleetLinkPreview? preview;
  final String? linkId;
  final String? confirmationCode;
  final FleetAccessFailure? failure;

  FleetLinkState _with({
    FleetLinkStep? step,
    bool busy = false,
    FleetLinkPreview? preview,
    String? linkId,
    String? confirmationCode,
    FleetAccessFailure? failure,
  }) => FleetLinkState(
    step: step ?? this.step,
    busy: busy,
    code: code,
    preview: preview ?? this.preview,
    linkId: linkId ?? this.linkId,
    confirmationCode: confirmationCode ?? this.confirmationCode,
    failure: failure,
  );

  @override
  List<Object?> get props => [
    step,
    busy,
    code,
    preview,
    linkId,
    confirmationCode,
    failure,
  ];
}

final class FleetLinkCubit extends Cubit<FleetLinkState> {
  FleetLinkCubit({
    required FleetAccessSource source,
    required Future<void> Function() onForbidden,
  }) : _source = source,
       _onForbidden = onForbidden,
       super(const FleetLinkState());

  final FleetAccessSource _source;
  final Future<void> Function() _onForbidden;

  /// A new code replaces the account's current code or pending link.
  Future<void> issue() async {
    if (state.busy) return;
    emit(state._with(busy: true));
    try {
      final code = await _source.createLinkCode();
      if (isClosed) return;
      emit(FleetLinkState(step: FleetLinkStep.issued, code: code));
    } on Object catch (error) {
      await _fail(error);
    }
  }

  /// Reads the pending link's channel and desk account before confirming.
  Future<void> preview({
    required String linkId,
    required String confirmationCode,
  }) async {
    if (state.busy || state.step != FleetLinkStep.issued) return;
    emit(state._with(busy: true));
    try {
      final preview = await _source.confirmLink(
        linkId: linkId,
        confirmationCode: confirmationCode,
        preview: true,
      );
      if (isClosed) return;
      emit(
        state._with(
          step: FleetLinkStep.pending,
          preview: preview,
          linkId: linkId,
          confirmationCode: confirmationCode,
        ),
      );
    } on Object catch (error) {
      await _fail(error);
    }
  }

  Future<void> confirm() async {
    final linkId = state.linkId;
    final confirmationCode = state.confirmationCode;
    if (state.busy || state.step != FleetLinkStep.pending) return;
    if (linkId == null || confirmationCode == null) return;
    emit(state._with(busy: true));
    try {
      final linked = await _source.confirmLink(
        linkId: linkId,
        confirmationCode: confirmationCode,
        preview: false,
      );
      if (isClosed) return;
      // The proof is single-use; nothing of it stays once the link exists.
      emit(FleetLinkState(step: FleetLinkStep.linked, preview: linked));
    } on Object catch (error) {
      await _fail(error);
    }
  }

  /// Back to the start, dropping the code and any pending proof.
  void restart() {
    if (!isClosed && !state.busy) emit(const FleetLinkState());
  }

  Future<void> _fail(Object error) async {
    if (isClosed) return;
    final failure = FleetAccessException.from(error).failure;
    emit(state._with(failure: failure));
    if (failure == FleetAccessFailure.forbidden) await _onForbidden();
  }
}
