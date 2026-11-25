part of 'mail_page.dart';

extension _MailWorkspaceKeyboard on _MailWorkspaceState {
  Widget _withMailKeyboard(
    BuildContext context,
    Widget child, {
    _MailSelection? routeSelection,
  }) => Focus(
    autofocus: usesMailActionBar(context),
    canRequestFocus: usesMailActionBar(context),
    skipTraversal: true,
    onKeyEvent: (_, event) {
      if (event is! KeyDownEvent ||
          !usesMailActionBar(context) ||
          !MailReadingPreferences.instance.keyboardEnabled ||
          !(ModalRoute.isCurrentOf(context) ?? true) ||
          (_childRouteOpen && routeSelection == null) ||
          (FocusManager.instance.primaryFocus?.context
                  ?.findAncestorWidgetOfExactType<EditableText>() !=
              null)) {
        return KeyEventResult.ignored;
      }
      final keyboard = HardwareKeyboard.instance;
      final command = mailKeyboardCommand(
        event.logicalKey,
        character: event.character,
        shift: keyboard.isShiftPressed,
        control: keyboard.isControlPressed,
        meta: keyboard.isMetaPressed,
        alt: keyboard.isAltPressed,
      );
      return command != null && _runMailCommand(command, routeSelection)
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    },
    child: child,
  );

  bool _runMailCommand(
    MailKeyboardCommand command,
    _MailSelection? routeSelection,
  ) {
    final reader = routeSelection ?? _activeSelection;
    if (command == MailKeyboardCommand.help) {
      unawaited(showMailKeyboardHelp(context));
      return true;
    }
    if (command == MailKeyboardCommand.back) {
      if (_selected.isNotEmpty) {
        _updateState(_selected.clear);
      } else if (routeSelection != null) {
        unawaited(Navigator.of(context).maybePop());
      } else if (reader != null) {
        _closeSelection();
      } else {
        return false;
      }
      return true;
    }
    if (command == MailKeyboardCommand.search) {
      if (routeSelection != null) {
        unawaited(Navigator.of(context).maybePop());
      }
      _startMailSearch();
      return true;
    }
    if (command == MailKeyboardCommand.compose && _canSend && !_mutating) {
      if (routeSelection == null) {
        unawaited(_compose());
        return true;
      }
      return handleMailReaderCommand(
        routeSelection.routeReader.currentState,
        command,
      );
    }
    if (!_accessVerified || _mutating) return false;

    final listKey = _visibleListKey;
    final focusedId =
        (_keyboardListKey == listKey ? _keyboardRowId : null) ?? reader?.id;
    final row = _items.where((item) => item['id'] == focusedId).firstOrNull;
    switch (command) {
      case MailKeyboardCommand.next:
      case MailKeyboardCommand.previous:
        if (_items.isEmpty) return false;
        final index = _items.indexWhere((item) => item['id'] == focusedId);
        final step = command == MailKeyboardCommand.next ? 1 : -1;
        final target = index < 0
            ? 0
            : (index + step).clamp(0, _items.length - 1);
        final item = _items[target];
        final id = item['id'] as String;
        _updateState(() {
          _keyboardListKey = listKey;
          _keyboardRowId = id;
        });
        if (_items.length > 1 &&
            !_visibleIds.contains(id) &&
            _conversationScroll.hasClients &&
            _conversationScroll.position.hasContentDimensions) {
          final end = _conversationScroll.position.maxScrollExtent;
          _conversationScroll.jumpTo(end * target / (_items.length - 1));
        }
        if (reader != null) {
          if (routeSelection == null) {
            if (id != reader.id) unawaited(_open(item));
          } else if (id != reader.id &&
              !_pendingDeferredIds.containsKey(id) &&
              !_pendingReaderIds.containsKey(id)) {
            _routeSelection.value = _selectConversation(
              item,
              reader.mailboxId,
            );
          }
        }
        return true;
      case MailKeyboardCommand.open:
        if (row == null || routeSelection != null) return false;
        unawaited(_open(row));
        return true;
      case MailKeyboardCommand.select:
        if (row == null || routeSelection != null) return false;
        _toggleSelection(row['id'] as String);
        return true;
      case MailKeyboardCommand.selectAll:
        if (routeSelection != null || _items.isEmpty) return false;
        _updateState(() {
          final clear = _items.every((item) => _selected.contains(item['id']));
          _selected.clear();
          if (!clear) {
            _selected.addAll(_items.map((item) => item['id'] as String));
          }
        });
        return true;
      case MailKeyboardCommand.reply:
      case MailKeyboardCommand.replyAll:
      case MailKeyboardCommand.forward:
      case MailKeyboardCommand.archive:
      case MailKeyboardCommand.trash:
      case MailKeyboardCommand.unread:
      case MailKeyboardCommand.star:
        break;
      default:
        return false;
    }

    final listAction = switch (command) {
      MailKeyboardCommand.archive => 'archive',
      MailKeyboardCommand.trash => 'trash',
      MailKeyboardCommand.unread => 'mark_unread',
      MailKeyboardCommand.star => row?['starred'] == true ? 'unstar' : 'star',
      _ => null,
    };
    if (_selected.isNotEmpty && listAction != null && _folder != 'drafts') {
      unawaited(_bulk(listAction));
      return true;
    }
    if (reader != null && (focusedId == reader.id || routeSelection != null)) {
      return handleMailReaderCommand(
        (routeSelection == null ? reader.paneReader : reader.routeReader)
            .currentState,
        command,
      );
    }
    if (listAction == null || row == null || _folder == 'drafts') return false;
    unawaited(_bulk(listAction, ids: {row['id'] as String}));
    return true;
  }
}
