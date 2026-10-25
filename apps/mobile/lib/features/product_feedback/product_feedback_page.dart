import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart'
    show newLocalMutationId;
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/widgets/security_check_dialog.dart';
import 'package:mobile/features/product_feedback/product_feedback_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ProductFeedbackPage extends StatelessWidget {
  const ProductFeedbackPage({super.key});
  @override
  Widget build(BuildContext context) {
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    return actor == null
        ? Center(child: Text(context.l10n.feedbackFailure))
        : ProductFeedbackForm(
            key: ValueKey(actor),
            actor: actor,
            isCurrent: () => context.read<AuthCubit>().state.user?.id == actor,
          );
  }
}

class ProductFeedbackForm extends StatefulWidget {
  const ProductFeedbackForm({
    required this.actor,
    required this.isCurrent,
    this.repository,
    this.verify,
    super.key,
  });
  final String actor;
  final bool Function() isCurrent;
  final ProductFeedbackRepository? repository;
  final Future<String?> Function(BuildContext)? verify;
  @override
  State<ProductFeedbackForm> createState() => _FeedbackFormState();
}

class _FeedbackFormState extends State<ProductFeedbackForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _body = TextEditingController();
  late final ProductFeedbackRepository _repository;
  SharedPreferences? _preferences;
  String? _pendingKey;
  ProductFeedbackDraft? _draft;
  Uint8List? _image;
  String? _contentType;
  String? _message;
  ProductFeedbackReceipt? _receipt;
  bool _busy = false;
  bool _editableFailure = false;
  bool _hasUnresolvedOutcome = false;
  String get _preferenceKey => 'product-feedback.pending.${widget.actor}';
  bool get _current => mounted && widget.isCurrent();
  @override
  void initState() {
    super.initState();
    _repository =
        widget.repository ??
        ProductFeedbackRepository(
          actorId: widget.actor,
          isCurrent: () => _current,
        );
    unawaited(_loadPending());
  }

  Future<void> _loadPending() async {
    final preferences = await SharedPreferences.getInstance();
    if (!_current) return;
    setState(() {
      _preferences = preferences;
      _pendingKey = preferences.getString(_preferenceKey);
      _hasUnresolvedOutcome = _pendingKey != null;
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    setState(() => _busy = true);
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (!_current || file == null) return;
      if (await file.length() > 2097152) throw const FormatException();
      final bytes = await file.readAsBytes();
      final type = lookupMimeType(
        file.name,
        headerBytes: bytes.take(16).toList(),
      );
      if (bytes.isEmpty ||
          bytes.length > 2097152 ||
          !const ['image/png', 'image/jpeg', 'image/webp'].contains(type)) {
        throw const FormatException();
      }
      if (_current) {
        setState(() {
          _image = bytes;
          _contentType = type;
          _message = null;
        });
      }
    } on Object {
      if (_current) setState(() => _message = context.l10n.feedbackMediaLimit);
    } finally {
      if (_current) setState(() => _busy = false);
    }
  }

  Future<void> _accepted(ProductFeedbackReceipt receipt) async {
    final removed = await _preferences!.remove(_preferenceKey);
    if (!_current) return;
    if (!removed) throw const FormatException('feedback_reference_not_cleared');
    setState(() {
      _receipt = receipt;
      _hasUnresolvedOutcome = false;
      _pendingKey = null;
      _draft = null;
      _image = null;
      _message = null;
    });
  }

  Future<void> _submit() async {
    if (_busy ||
        _preferences == null ||
        (_pendingKey != null && _draft == null)) {
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    if (_draft == null && _formKey.currentState?.validate() != true) return;
    setState(() {
      _busy = true;
      _message = null;
      _editableFailure = false;
    });
    var dispatched = false;
    try {
      final draft =
          _draft ??
          ProductFeedbackDraft(
            title: _title.text,
            body: _body.text,
            image: _image,
            contentType: _contentType,
          );
      final token = await (widget.verify ?? showSecurityCheck)(context);
      if (!_current) return;
      if (token == null || token.isEmpty) {
        setState(() => _message = context.l10n.feedbackVerification);
        return;
      }
      _draft = draft;
      final key = _pendingKey ?? newLocalMutationId();
      // Persist only the original reference, never text, screenshot or token.
      if (!await _preferences!.setString(_preferenceKey, key)) {
        throw const FormatException();
      }
      if (!_current) return;
      setState(() => _pendingKey = key);
      dispatched = true;
      final receipt = await _repository.submit(
        draft: draft,
        key: key,
        token: token,
      );
      if (_current) await _accepted(receipt);
    } on ApiException catch (error) {
      if (_current) {
        setState(() {
          final rejected = const [
            400,
            401,
            403,
            413,
            429,
          ].contains(error.statusCode);
          _hasUnresolvedOutcome |= dispatched && !rejected;
          _editableFailure = rejected && !_hasUnresolvedOutcome;
          _message = error.statusCode == 429
              ? context.l10n.feedbackLimited
              : context.l10n.feedbackFailure;
        });
      }
    } on Object {
      if (_current) {
        setState(() {
          _hasUnresolvedOutcome |= dispatched;
          _message = context.l10n.feedbackFailure;
        });
      }
    } finally {
      if (_current) setState(() => _busy = false);
    }
  }

  Future<void> _observe() async {
    if (_busy || _pendingKey == null) return;
    setState(() => _busy = true);
    try {
      final receipt = await _repository.receipt(_pendingKey!);
      if (!_current) return;
      if (receipt == null) {
        setState(() => _message = context.l10n.feedbackPending);
      } else {
        await _accepted(receipt);
      }
    } on Object {
      if (_current) setState(() => _message = context.l10n.feedbackFailure);
    } finally {
      if (_current) setState(() => _busy = false);
    }
  }

  Future<void> _editRejected() async {
    if (!_editableFailure || _hasUnresolvedOutcome || _busy) return;
    if (!await _preferences!.remove(_preferenceKey)) return;
    if (_current) {
      setState(() {
        _pendingKey = null;
        _draft = null;
        _editableFailure = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locked = _busy || _pendingKey != null || _preferences == null;
    return Form(
      key: _formKey,
      child: AppPageListView(
        kind: AppPageKind.form,
        children: [
          Text(l10n.feedbackPrivate),
          const SizedBox(height: 16),
          if (_receipt != null) ...[
            Text(l10n.feedbackSent),
            SelectableText(_receipt!.id),
          ] else ...[
            TextFormField(
              controller: _title,
              validator: (value) =>
                  value == null ||
                      value.trim().runes.isEmpty ||
                      value.trim().runes.length > 160
                  ? l10n.feedbackSubjectRequired
                  : null,
              enabled: !locked,
              maxLength: 160,
              decoration: InputDecoration(
                labelText: l10n.feedbackSubject,
                hintText: l10n.feedbackSubjectPlaceholder,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _body,
              validator: (value) =>
                  value == null ||
                      value.trim().runes.isEmpty ||
                      value.trim().runes.length > 8000
                  ? l10n.feedbackDetailsRequired
                  : null,
              enabled: !locked,
              maxLength: 8000,
              minLines: 5,
              maxLines: 12,
              decoration: InputDecoration(
                labelText: l10n.feedbackDetails,
                hintText: l10n.feedbackDetailsPlaceholder,
              ),
            ),
            const SizedBox(height: 12),
            if (_image != null) ...[
              Text(l10n.feedbackMediaSelected),
              TextButton(
                onPressed: locked
                    ? null
                    : () => setState(() {
                        _image = null;
                        _contentType = null;
                      }),
                child: Text(l10n.feedbackRemoveMedia),
              ),
            ] else
              OutlinedButton(
                onPressed: locked ? null : _pickImage,
                child: Text(l10n.feedbackAttach),
              ),
            if (_pendingKey != null) ...[
              Text(l10n.feedbackPending),
              SelectableText(_pendingKey!),
              TextButton(
                onPressed: _busy ? null : _observe,
                child: Text(l10n.feedbackCheckReceipt),
              ),
            ],
            if (_message != null) Text(_message!),
            const SizedBox(height: 16),
            FilledButton(
              onPressed:
                  _busy ||
                      _preferences == null ||
                      (_pendingKey != null && _draft == null)
                  ? null
                  : _submit,
              child: Text(
                _busy
                    ? l10n.feedbackSending
                    : _pendingKey == null
                    ? l10n.feedbackSend
                    : l10n.feedbackRetry,
              ),
            ),
            if (_editableFailure)
              TextButton(
                onPressed: _busy ? null : _editRejected,
                child: Text(l10n.feedbackEditRejected),
              ),
          ],
        ],
      ),
    );
  }
}
