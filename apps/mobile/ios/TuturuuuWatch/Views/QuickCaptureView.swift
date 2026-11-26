import SwiftUI
import TuturuuuWatchKit

struct QuickCaptureView: View {
  @ObservedObject var viewModel: WatchAppViewModel
  @Environment(\.dismiss) private var dismiss

  @State private var title: String = ""
  @State private var priority: WatchTaskPriority = .normal
  @State private var isSaving: Bool = false

  private let selectablePriorities: [WatchTaskPriority] = [.critical, .high, .normal, .low]

  var body: some View {
    ScrollView {
      content(interactiveDictation: true)
    }
    .background(SorbetWatchPalette.background.color.ignoresSafeArea())
  }

  var snapshotContent: some View {
    content(interactiveDictation: false)
  }

  private var dictationPromptLabel: some View {
    HStack(spacing: 6) {
      Image(systemName: "mic.fill")
        .foregroundStyle(SorbetWatchPalette.green.ink.color)
      Text(title.isEmpty ? viewModel.text(.quickCapturePrompt) : title)
        .font(.system(.footnote, design: .rounded).weight(.medium))
        .foregroundStyle(
          title.isEmpty
            ? SorbetWatchPalette.mutedForeground.color
            : SorbetWatchPalette.foreground.color
        )
        .lineLimit(3)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
        .fill(SorbetWatchPalette.surface.color)
    )
  }

  @ViewBuilder
  private func content(interactiveDictation: Bool) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(viewModel.text(.quickCaptureTitle))
        .font(.system(.headline, design: .rounded).weight(.bold))
        .foregroundStyle(SorbetWatchPalette.foreground.color)

      if interactiveDictation {
        TextFieldLink(prompt: Text(viewModel.text(.quickCapturePrompt))) {
          dictationPromptLabel
        } onSubmit: { submitted in
          title = submitted.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        .buttonStyle(.plain)
      } else {
        dictationPromptLabel
      }

      LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
        ForEach(selectablePriorities, id: \.self) { option in
          let hue = SorbetWatchPalette.hue(for: option)
          let selected = priority == option
          Button {
            priority = option
          } label: {
            Text(WatchStrings.priorityLabel(option, locale: viewModel.locale))
              .font(.system(size: 11, weight: .bold, design: .rounded))
              .lineLimit(1)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 6)
              .foregroundStyle(selected ? hue.ink.color : SorbetWatchPalette.mutedForeground.color)
              .background(
                Capsule().fill(
                  selected
                    ? hue.activeFill(calmColors: viewModel.calmColors).color
                    : SorbetWatchPalette.surfaceSunken.color
                )
              )
          }
          .buttonStyle(.plain)
        }
      }

      Button {
        Task {
          isSaving = true
          let ok = await viewModel.quickCaptureTask(title: title, priority: priority)
          isSaving = false
          if ok {
            dismiss()
          }
        }
      } label: {
        HStack(spacing: 6) {
          if isSaving {
            ProgressView()
              .tint(SorbetWatchPalette.primaryForeground.color)
          }
          Text(viewModel.text(.quickCaptureSave))
            .font(.system(.footnote, design: .rounded).weight(.bold))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
      }
      .buttonStyle(.plain)
      .foregroundStyle(
        canSave
          ? SorbetWatchPalette.primaryForeground.color
          : SorbetWatchPalette.mutedForeground.color
      )
      .background(
        Capsule().fill(
          canSave
            ? SorbetWatchPalette.primary.color
            : SorbetWatchPalette.surfaceSunken.color
        )
      )
      .disabled(!canSave)
    }
    .padding(.horizontal, 4)
    .padding(.bottom, 12)
  }

  private var canSave: Bool {
    !isSaving && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}
