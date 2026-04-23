import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart'
    hide AlertDialog, FilledButton, TextButton, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/threshold.dart';
import 'package:mobile/features/time_tracker/widgets/category_selector_button.dart';
import 'package:mobile/features/time_tracker/widgets/category_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/image_source_picker_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class MissedEntryDialog extends StatefulWidget {
  const MissedEntryDialog({
    required this.categories,
    required this.onSave,
    this.categoryListCubit,
    this.onCreateCategory,
    this.canBypassRequestApproval = false,
    this.thresholdDays,
    this.initialStartTime,
    this.initialEndTime,
    this.initialTitle,
    this.initialDescription,
    this.initialCategoryId,
    super.key,
  });

  final List<TimeTrackingCategory> categories;

  /// When set, the category picker reads live [TimeTrackerState.categories]
  /// so new categories appear after [onCreateCategory] updates the cubit.
  final TimeTrackerCubit? categoryListCubit;
  final Future<void> Function({
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    required bool shouldSubmitAsRequest,
    required List<String> imageLocalPaths,
    String? categoryId,
    String? description,
  })
  onSave;
  final Future<void> Function({
    required String name,
    String? color,
    String? description,
  })?
  onCreateCategory;
  final bool canBypassRequestApproval;
  final int? thresholdDays;
  final DateTime? initialStartTime;
  final DateTime? initialEndTime;
  final String? initialTitle;
  final String? initialDescription;
  final String? initialCategoryId;

  @override
  State<MissedEntryDialog> createState() => _MissedEntryDialogState();
}

class _MissedEntryDialogState extends State<MissedEntryDialog> {
  final ImagePicker _picker = ImagePicker();
  late final TextEditingController _titleCtrl;
  late final TextEditingController _descCtrl;
  final List<XFile> _images = [];
  String? _categoryId;
  late DateTime _startTime;
  late DateTime _endTime;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController();
    _descCtrl = TextEditingController();
    _titleCtrl.text = widget.initialTitle ?? '';
    _descCtrl.text = widget.initialDescription ?? '';
    _categoryId = widget.initialCategoryId;
    final now = DateTime.now();
    _endTime = widget.initialEndTime ?? now;
    _startTime =
        widget.initialStartTime ?? now.subtract(const Duration(hours: 1));
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  final GlobalKey<NavigatorState> _nestedNavKey = GlobalKey<NavigatorState>();

  Future<bool> _onNestedNavigatorBack() async {
    final nested = _nestedNavKey.currentState;
    if (nested != null && await nested.maybePop()) {
      return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: BackButtonListener(
        onBackButtonPressed: _onNestedNavigatorBack,
        child: Navigator(
          key: _nestedNavKey,
          onGenerateRoute: (_) => MaterialPageRoute<void>(
            settings: const RouteSettings(name: 'missed_entry_form'),
            builder: (nestedContext) => _buildFormPage(nestedContext, context),
          ),
        ),
      ),
    );
  }

  Widget _buildFormPage(BuildContext nestedContext, BuildContext hostContext) {
    final l10n = nestedContext.l10n;
    final theme = shad.Theme.of(nestedContext);
    final materialTheme = Theme.of(nestedContext);
    final dateFmt = DateFormat.yMMMd();
    final timeFmt = DateFormat.Hm();

    final duration = _endTime.difference(_startTime);
    final durationText = _formatDuration(duration);
    final showThresholdWarning =
        _isOlderThanThreshold && !widget.canBypassRequestApproval;
    final requiresProof = showThresholdWarning;
    final isDarkMode = materialTheme.brightness == Brightness.dark;
    final warningBackgroundColor = isDarkMode
        ? const Color(0xFF3D2F14)
        : const Color(0xFFFFF8E1);
    final warningBorderColor = isDarkMode
        ? const Color(0xFF8D6E2A)
        : const Color(0xFFFFCC80);
    final warningTextColor = isDarkMode
        ? const Color(0xFFFFE0B2)
        : const Color(0xFF5D4037);
    final keyboardBottomInset = MediaQuery.viewInsetsOf(nestedContext).bottom;

    return DismissKeyboardOnPointerDown(
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + keyboardBottomInset),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.timerAddMissedEntry,
                style: theme.typography.h3,
              ),
              const shad.Gap(24),
              shad.FormField(
                key: const shad.FormKey<String>(#missedEntryTitle),
                label: Text(l10n.timerSessionTitle),
                child: shad.TextField(
                  contextMenuBuilder: platformTextContextMenuBuilder(),
                  controller: _titleCtrl,
                ),
              ),
              const shad.Gap(16),
              shad.FormField(
                key: const shad.FormKey<String>(#missedEntryDesc),
                label: Text(l10n.timerDescription),
                child: shad.TextField(
                  contextMenuBuilder: platformTextContextMenuBuilder(),
                  controller: _descCtrl,
                  maxLines: 3,
                ),
              ),
              const shad.Gap(16),
              if (widget.categoryListCubit != null)
                BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
                  bloc: widget.categoryListCubit,
                  buildWhen: (previous, current) =>
                      previous.categories != current.categories,
                  builder: (context, state) {
                    if (state.categories.isEmpty) {
                      return const SizedBox.shrink();
                    }
                    return shad.FormField(
                      key: const shad.FormKey<String?>(#missedEntryCategory),
                      label: Text(l10n.timerCategory),
                      child: CategorySelectorButton(
                        categories: state.categories,
                        selectedCategoryId: _categoryId,
                        onTap: () => unawaited(_pickCategory(nestedContext)),
                      ),
                    );
                  },
                )
              else if (widget.categories.isNotEmpty)
                shad.FormField(
                  key: const shad.FormKey<String?>(#missedEntryCategory),
                  label: Text(l10n.timerCategory),
                  child: CategorySelectorButton(
                    categories: widget.categories,
                    selectedCategoryId: _categoryId,
                    onTap: () => unawaited(_pickCategory(nestedContext)),
                  ),
                ),
              const shad.Gap(16),
              _DateTimePicker(
                routeContext: nestedContext,
                label: l10n.timerStartTime,
                value: _startTime,
                dateFmt: dateFmt,
                timeFmt: timeFmt,
                onChanged: (dt) => setState(() => _startTime = dt),
              ),
              const shad.Gap(12),
              _DateTimePicker(
                routeContext: nestedContext,
                label: l10n.timerEndTime,
                value: _endTime,
                dateFmt: dateFmt,
                timeFmt: timeFmt,
                onChanged: (dt) => setState(() => _endTime = dt),
              ),
              if (showThresholdWarning) ...[
                const shad.Gap(12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: warningBackgroundColor,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: warningBorderColor,
                    ),
                  ),
                  child: Text(
                    widget.thresholdDays == 0
                        ? l10n.timerThresholdWarningAll
                        : l10n.timerThresholdWarning(
                            widget.thresholdDays ?? 0,
                          ),
                    style: theme.typography.small.copyWith(
                      color: warningTextColor,
                    ),
                  ),
                ),
                const shad.Gap(12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.timerRequestProofImagesCount(
                          _images.length,
                          _maxImages,
                        ),
                        style: theme.typography.small,
                      ),
                    ),
                    shad.OutlineButton(
                      leading: Icon(shad.LucideIcons.image),
                      onPressed: _images.length >= _maxImages
                          ? null
                          : () => unawaited(_pickImageSource(nestedContext)),
                      child: Text(l10n.timerRequestAddImage),
                    ),
                  ],
                ),
                const shad.Gap(8),
                if (_images.isNotEmpty)
                  SizedBox(
                    height: 76,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemBuilder: (context, index) {
                        final image = _images[index];
                        return Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                File(image.path),
                                width: 76,
                                height: 76,
                                fit: BoxFit.cover,
                              ),
                            ),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _images.removeAt(index);
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close,
                                    color: Colors.white,
                                    size: 14,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                      separatorBuilder: (_, _) => const shad.Gap(8),
                      itemCount: _images.length,
                    ),
                  ),
                if (requiresProof && _images.isEmpty) ...[
                  const shad.Gap(8),
                  Text(
                    l10n.timerProofOfWorkRequired,
                    style: theme.typography.small.copyWith(
                      color: theme.colorScheme.destructive,
                    ),
                  ),
                ],
              ],
              const shad.Gap(12),
              Text(
                '${l10n.timerDuration}: $durationText',
                style: theme.typography.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const shad.Gap(24),
              shad.PrimaryButton(
                onPressed: _isValid && !_isSubmitting
                    ? () async {
                        final navigator = Navigator.of(hostContext);
                        final toastContext = Navigator.of(
                          hostContext,
                          rootNavigator: true,
                        ).context;
                        setState(() => _isSubmitting = true);

                        final workSessionTitle = _titleCtrl.text.isEmpty
                            ? l10n.timerWorkSession
                            : _titleCtrl.text;
                        final successTitle = showThresholdWarning
                            ? l10n.timerRequestSubmittedTitle
                            : l10n.timerMissedEntrySavedTitle;
                        final successContent = showThresholdWarning
                            ? l10n.timerRequestSubmittedContent
                            : l10n.timerMissedEntrySavedContent;
                        final errorTitle = l10n.commonSomethingWentWrong;

                        try {
                          await widget.onSave(
                            title: workSessionTitle,
                            categoryId: _categoryId,
                            startTime: _startTime,
                            endTime: _endTime,
                            shouldSubmitAsRequest: showThresholdWarning,
                            imageLocalPaths: _images
                                .map((file) => file.path)
                                .toList(),
                            description: _descCtrl.text.isEmpty
                                ? null
                                : _descCtrl.text,
                          );

                          if (!mounted ||
                              !hostContext.mounted ||
                              !nestedContext.mounted) {
                            return;
                          }

                          shad.showToast(
                            context: toastContext,
                            builder: (context, overlay) => shad.Alert(
                              title: Text(successTitle),
                              content: Text(successContent),
                            ),
                          );

                          setState(() => _isSubmitting = false);

                          if (!nestedContext.mounted) {
                            return;
                          }
                          await shad.closeOverlay<void>(nestedContext);
                          if (!mounted || !hostContext.mounted) {
                            return;
                          }

                          if (navigator.canPop()) {
                            navigator.pop();
                          }
                        } on ApiException catch (error) {
                          if (!mounted || !hostContext.mounted) {
                            return;
                          }

                          shad.showToast(
                            context: toastContext,
                            builder: (context, overlay) =>
                                shad.Alert.destructive(
                                  title: Text(errorTitle),
                                  content: Text(_toErrorMessage(error)),
                                ),
                          );

                          setState(() => _isSubmitting = false);
                        } on Object {
                          if (!mounted ||
                              !hostContext.mounted ||
                              !nestedContext.mounted) {
                            return;
                          }

                          shad.showToast(
                            context: toastContext,
                            builder: (context, overlay) =>
                                shad.Alert.destructive(
                                  title: Text(errorTitle),
                                  content: Text(
                                    nestedContext.l10n.commonSomethingWentWrong,
                                  ),
                                ),
                          );

                          setState(() => _isSubmitting = false);
                        }
                      }
                    : null,
                child: _isSubmitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: shad.CircularProgressIndicator(),
                      )
                    : Text(
                        showThresholdWarning
                            ? l10n.timerSubmitForApproval
                            : l10n.timerSave,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool get _isOlderThanThreshold {
    return exceedsThreshold(_startTime, widget.thresholdDays);
  }

  bool get _isValid {
    if (!_endTime.isAfter(_startTime)) {
      return false;
    }

    if (_isOlderThanThreshold &&
        !widget.canBypassRequestApproval &&
        _images.isEmpty) {
      return false;
    }

    return true;
  }

  static const int _maxImages = 5;

  Future<void> _pickImageSource(BuildContext modalContext) async {
    final l10n = modalContext.l10n;
    final source = await showImageSourcePickerDialog(
      context: modalContext,
      title: l10n.selectImageSource,
      cameraLabel: l10n.camera,
      galleryLabel: l10n.gallery,
    );

    if (source == null) {
      return;
    }

    if (source == ImageSource.camera) {
      final image = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );
      if (!mounted) return;
      if (image != null && _images.length < _maxImages) {
        setState(() {
          _images.add(image);
        });
      }
      return;
    }

    final images = await _picker.pickMultiImage();
    if (!mounted) return;
    if (images.isEmpty) {
      return;
    }

    setState(() {
      for (final image in images) {
        if (_images.length >= _maxImages) {
          break;
        }
        _images.add(image);
      }
    });
  }

  Future<void> _pickCategory(BuildContext sheetContext) async {
    final categories =
        widget.categoryListCubit?.state.categories ?? widget.categories;
    await showCategorySheet(
      context: sheetContext,
      categories: categories,
      selectedCategoryId: _categoryId,
      onSelected: (id) {
        if (mounted) {
          setState(() {
            _categoryId = id;
          });
        }
      },
      onCreateCategory: widget.onCreateCategory,
      useRootNavigator: false,
    );
  }

  String _toErrorMessage(ApiException error) {
    final message = error.message.trim();
    if (message.isEmpty) {
      return context.l10n.commonSomethingWentWrong;
    }
    return message;
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.abs() % 60;
    final s = d.inSeconds.abs() % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }
}

class _DateTimePicker extends StatefulWidget {
  const _DateTimePicker({
    required this.routeContext,
    required this.label,
    required this.value,
    required this.dateFmt,
    required this.timeFmt,
    required this.onChanged,
  });

  /// Host route used for picker routes so they stack on the missed-entry
  /// nested [Navigator] instead of the root navigator (which sits behind
  /// the drawer overlay back handler).
  final BuildContext routeContext;
  final String label;
  final DateTime value;
  final DateFormat dateFmt;
  final DateFormat timeFmt;
  final ValueChanged<DateTime> onChanged;

  @override
  State<_DateTimePicker> createState() => _DateTimePickerState();
}

class _DateTimePickerState extends State<_DateTimePicker> {
  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: widget.routeContext,
      useRootNavigator: false,
      initialDate: widget.value,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (!mounted) {
      return;
    }
    if (date != null) {
      widget.onChanged(
        DateTime(
          date.year,
          date.month,
          date.day,
          widget.value.hour,
          widget.value.minute,
        ),
      );
    }
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: widget.routeContext,
      useRootNavigator: false,
      initialTime: TimeOfDay.fromDateTime(widget.value.toLocal()),
    );
    if (!mounted) {
      return;
    }
    if (time != null) {
      widget.onChanged(
        DateTime(
          widget.value.year,
          widget.value.month,
          widget.value.day,
          time.hour,
          time.minute,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final local = widget.value.toLocal();
    final dateText = widget.dateFmt.format(local);
    final timeText = widget.timeFmt.format(local);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.label,
          style: theme.typography.small.copyWith(
            fontWeight: FontWeight.w600,
            color: colorScheme.foreground,
          ),
        ),
        const shad.Gap(8),
        Row(
          children: [
            Expanded(
              child: _MissedEntryDateTimeSegment(
                icon: shad.LucideIcons.calendar,
                text: dateText,
                onTap: () => unawaited(_pickDate()),
              ),
            ),
            const shad.Gap(10),
            Expanded(
              child: _MissedEntryDateTimeSegment(
                icon: shad.LucideIcons.clock,
                text: timeText,
                onTap: () => unawaited(_pickTime()),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Bordered tappable segment aligned with [CategorySelectorButton] styling.
class _MissedEntryDateTimeSegment extends StatelessWidget {
  const _MissedEntryDateTimeSegment({
    required this.icon,
    required this.text,
    required this.onTap,
  });

  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: colorScheme.border),
            color: colorScheme.background,
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 16,
                color: colorScheme.primary,
              ),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    color: colorScheme.foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Icon(
                shad.LucideIcons.chevronDown,
                size: 14,
                color: colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
