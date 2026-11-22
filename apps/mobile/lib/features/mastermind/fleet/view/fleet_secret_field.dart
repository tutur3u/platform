import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// UTF-8 byte length of [text] without encoding a copy of it.
int fleetSecretUtf8Length(String text) {
  var bytes = 0;
  for (final rune in text.runes) {
    bytes += rune < 0x80
        ? 1
        : rune < 0x800
        ? 2
        : rune < 0x10000
        ? 3
        : 4;
  }
  return bytes;
}

/// Refuses an edit that would pass [FleetSecretBinding.maxValueBytes].
class _ByteCap extends TextInputFormatter {
  const _ByteCap(this.onRefused);

  final VoidCallback onRefused;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (fleetSecretUtf8Length(newValue.text) <=
        FleetSecretBinding.maxValueBytes) {
      return newValue;
    }
    onRefused();
    return oldValue;
  }
}

/// The one field that holds a secret value, with its send button.
///
/// Obscured, with no autocorrect, suggestions, smart punctuation, IME
/// learning, autofill or clipboard (no selection and an empty menu), and at
/// most 4096 UTF-8 bytes. The text is cleared when the app leaves the
/// foreground, when App Lock locks and when the field goes away (expiry,
/// a closed request, sign-out). [onSubmit] receives the bytes once and owns
/// them; the field keeps nothing and never logs or stores the value.
class FleetSecretField extends StatefulWidget {
  const FleetSecretField({
    required this.onSubmit,
    this.enabled = true,
    super.key,
  });

  final void Function(Uint8List value) onSubmit;
  final bool enabled;

  @override
  State<FleetSecretField> createState() => _FleetSecretFieldState();
}

class _FleetSecretFieldState extends State<FleetSecretField> {
  final _controller = TextEditingController();
  late final AppLifecycleListener _lifecycle;
  StreamSubscription<AppLockState>? _lock;
  bool _empty = true;
  bool _capped = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onChanged);
    _lifecycle = AppLifecycleListener(onStateChange: _onLifecycle);
    _lock = context.read<AppLockCubit?>()?.stream.listen((lock) {
      if (lock.locked) _clear();
    });
  }

  void _onChanged() {
    final empty = _controller.text.isEmpty;
    if (empty != _empty) setState(() => _empty = empty);
  }

  void _onLifecycle(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _clear();
  }

  void _clear() {
    if (_controller.text.isEmpty && !_capped) return;
    _controller.clear();
    if (mounted) setState(() => _capped = false);
  }

  void _submit() {
    if (!widget.enabled || _controller.text.isEmpty) return;
    final value = Uint8List.fromList(utf8.encode(_controller.text));
    _controller.clear();
    widget.onSubmit(value);
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_onChanged)
      ..clear()
      ..dispose();
    _lifecycle.dispose();
    unawaited(_lock?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    OutlineInputBorder outline(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(tokens.shapes.field),
          borderSide: BorderSide(color: color, width: width),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: const ValueKey('fleet-secret-field'),
          controller: _controller,
          enabled: widget.enabled,
          autofocus: true,
          obscureText: true,
          autocorrect: false,
          enableSuggestions: false,
          enableIMEPersonalizedLearning: false,
          keyboardType: TextInputType.visiblePassword,
          smartDashesType: SmartDashesType.disabled,
          smartQuotesType: SmartQuotesType.disabled,
          textInputAction: TextInputAction.send,
          enableInteractiveSelection: false,
          // Null opts out of autofill entirely; an empty list still joins.
          autofillHints: null,
          contextMenuBuilder: (_, _) => const SizedBox.shrink(),
          inputFormatters: [
            _ByteCap(() {
              if (!_capped) setState(() => _capped = true);
            }),
          ],
          onSubmitted: (_) => _submit(),
          style: tokens.typography.body.copyWith(color: c.foreground),
          cursorColor: c.primary,
          decoration: InputDecoration(
            hintText: l10n.mastermindSecretValuePlaceholder,
            hintStyle: tokens.typography.body.copyWith(
              color: c.mutedForeground,
            ),
            errorText: _capped ? l10n.mastermindSecretTooLong : null,
            prefixIcon: const Icon(LucideIcons.lock, size: 18),
            prefixIconColor: c.mutedForeground,
            isDense: true,
            contentPadding: tokens.shapes.fieldPadding,
            border: outline(c.input),
            enabledBorder: outline(c.input),
            disabledBorder: outline(c.input.withValues(alpha: 0.5)),
            focusedBorder: outline(c.ring, 1.5),
            errorBorder: outline(c.destructive),
            focusedErrorBorder: outline(c.destructive, 1.5),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton.primary(
          key: const ValueKey('fleet-secret-send'),
          enabled: widget.enabled && !_empty,
          leading: const Icon(LucideIcons.send, size: 16),
          onPressed: _submit,
          child: Text(l10n.mastermindSecretSend),
        ),
      ],
    );
  }
}
