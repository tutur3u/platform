import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_config.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellTopBarTitle extends StatelessWidget {
  const ShellTopBarTitle({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final config = ShellChromeConfig.forLocation(context, matchedLocation);
    final titleOverrideCubit = lookupShellTitleOverrideCubit(context);

    if (titleOverrideCubit == null) {
      return _ShellTopBarTitleContent(
        title: config.title,
        showLeadingBrand: true,
      );
    }

    return BlocBuilder<ShellTitleOverrideCubit, ShellTitleOverrideState>(
      bloc: titleOverrideCubit,
      buildWhen: (previous, current) =>
          previous.resolveForLocation(matchedLocation) !=
              current.resolveForLocation(matchedLocation) ||
          previous.showLeadingBrandForLocation(matchedLocation) !=
              current.showLeadingBrandForLocation(matchedLocation) ||
          previous.canEditTitleForLocation(matchedLocation) !=
              current.canEditTitleForLocation(matchedLocation),
      builder: (context, state) {
        final title = state.resolveForLocation(matchedLocation) ?? config.title;
        return _ShellTopBarTitleContent(
          title: title,
          showLeadingBrand: state.showLeadingBrandForLocation(matchedLocation),
          onTitleSubmitted: state.titleSubmitterForLocation(matchedLocation),
        );
      },
    );
  }
}

class _ShellTopBarTitleContent extends StatelessWidget {
  const _ShellTopBarTitleContent({
    required this.title,
    required this.showLeadingBrand,
    this.onTitleSubmitted,
  });

  final String title;
  final bool showLeadingBrand;
  final Future<void> Function(String title)? onTitleSubmitted;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: mobileSectionAppBarHeight,
      width: double.infinity,
      child: Row(
        children: [
          if (showLeadingBrand) ...[
            Image.asset(
              'assets/logos/transparent.png',
              width: mobileSectionAppBarLogoSize,
              height: mobileSectionAppBarLogoSize,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: _AnimatedTitleText(
                title: title,
                onTitleSubmitted: onTitleSubmitted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnimatedTitleText extends StatefulWidget {
  const _AnimatedTitleText({
    required this.title,
    this.onTitleSubmitted,
  });

  final String title;
  final Future<void> Function(String title)? onTitleSubmitted;

  @override
  State<_AnimatedTitleText> createState() => _AnimatedTitleTextState();
}

class _AnimatedTitleTextState extends State<_AnimatedTitleText> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;
  late final ScrollController _titleScrollController;
  bool _isEditing = false;
  bool _isSaving = false;
  bool _hasMoreTitleToRight = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.title);
    _focusNode = FocusNode();
    _titleScrollController = ScrollController();
    _titleScrollController.addListener(_syncTitleFade);
  }

  @override
  void didUpdateWidget(covariant _AnimatedTitleText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_isEditing && oldWidget.title != widget.title) {
      _controller.text = widget.title;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_titleScrollController.hasClients) {
          return;
        }
        _titleScrollController.jumpTo(0);
        _syncTitleFade();
      });
    }
    if (widget.onTitleSubmitted == null && _isEditing) {
      _isEditing = false;
      _controller.text = widget.title;
    }
  }

  @override
  void dispose() {
    _titleScrollController
      ..removeListener(_syncTitleFade)
      ..dispose();
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _syncTitleFade() {
    if (!_titleScrollController.hasClients) {
      return;
    }

    final position = _titleScrollController.position;
    final nextHasMore = position.maxScrollExtent - position.pixels > 1;
    if (nextHasMore == _hasMoreTitleToRight) {
      return;
    }

    setState(() => _hasMoreTitleToRight = nextHasMore);
  }

  void _startEditing() {
    if (_isSaving || widget.onTitleSubmitted == null) {
      return;
    }
    setState(() {
      _isEditing = true;
      _controller.text = widget.title;
      _controller.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _controller.text.length,
      );
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _focusNode.requestFocus();
      }
    });
  }

  Future<void> _submit() async {
    final submitter = widget.onTitleSubmitted;
    if (_isSaving || submitter == null) {
      return;
    }
    _focusNode.unfocus();

    final nextTitle = _controller.text.trim();
    final currentTitle = widget.title.trim();
    if (nextTitle.isEmpty || nextTitle == currentTitle) {
      setState(() {
        _controller.text = widget.title;
        _isEditing = false;
      });
      return;
    }

    setState(() => _isSaving = true);
    try {
      await submitter(nextTitle);
      if (!mounted) return;
      setState(() {
        _controller.text = nextTitle;
        _isEditing = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      final fallbackMessage = context.l10n.commonSomethingWentWrong;
      final message = error.toString().trim();
      shad.showToast(
        context: context,
        builder: (context, overlay) => shad.Alert.destructive(
          content: Text(message.isEmpty ? fallbackMessage : message),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (currentChild, previousChildren) => Stack(
        alignment: Alignment.centerLeft,
        children: [
          ...previousChildren,
          if (currentChild != null) currentChild,
        ],
      ),
      transitionBuilder: (child, animation) {
        final offsetAnimation = Tween<Offset>(
          begin: const Offset(0, 0.12),
          end: Offset.zero,
        ).animate(animation);
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: offsetAnimation, child: child),
        );
      },
      child: _isEditing
          ? _buildEditor(context, theme)
          : _buildScrollableTitle(context, theme),
    );
  }

  Widget _buildScrollableTitle(BuildContext context, shad.ThemeData theme) {
    final titleStyle = theme.typography.large.copyWith(
      fontWeight: FontWeight.w700,
    );

    return Semantics(
      button: widget.onTitleSubmitted != null,
      label: widget.title,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _startEditing,
        child: SizedBox(
          key: ValueKey<String>('title-view-${widget.title}'),
          height: mobileSectionAppBarHeight,
          width: double.infinity,
          child: LayoutBuilder(
            builder: (context, constraints) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) {
                  _syncTitleFade();
                }
              });

              final scrollableTitle = SingleChildScrollView(
                controller: _titleScrollController,
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minWidth: constraints.maxWidth,
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      widget.title,
                      maxLines: 1,
                      softWrap: false,
                      style: titleStyle,
                    ),
                  ),
                ),
              );

              return ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (bounds) => LinearGradient(
                  colors: [
                    Colors.white,
                    Colors.white,
                    if (_hasMoreTitleToRight)
                      Colors.transparent
                    else
                      Colors.white,
                  ],
                  stops: const [0, 0.9, 1],
                ).createShader(bounds),
                child: scrollableTitle,
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildEditor(BuildContext context, shad.ThemeData theme) {
    final titleStyle = theme.typography.large.copyWith(
      fontWeight: FontWeight.w700,
    );

    return SizedBox(
      key: ValueKey<String>('title-editor-${widget.title}'),
      height: mobileSectionAppBarHeight,
      width: double.infinity,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              enabled: !_isSaving,
              scrollPadding: EdgeInsets.zero,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) {
                FocusScope.of(context).unfocus();
                unawaited(_submit());
              },
              style: titleStyle,
              decoration: InputDecoration(
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                hintText: widget.title,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Tooltip(
            message: context.l10n.commonSave,
            child: shad.IconButton.ghost(
              onPressed: _isSaving ? null : () => unawaited(_submit()),
              icon: _isSaving
                  ? const SizedBox.square(
                      dimension: 18,
                      child: shad.CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_rounded, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}
