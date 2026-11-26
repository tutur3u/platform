import SwiftUI
import TuturuuuWatchKit

struct MiraQuickAskView: View {
  @ObservedObject var viewModel: WatchAppViewModel

  var body: some View {
    ScrollView {
      content(interactiveDictation: true)
    }
    .background(SorbetWatchPalette.background.color.ignoresSafeArea())
  }

  var snapshotContent: some View {
    content(interactiveDictation: false)
  }

  private var askButtonLabel: some View {
    HStack(spacing: 6) {
      Image(systemName: "mic.fill")
      Text(
        viewModel.miraReply.isEmpty
          ? viewModel.text(.miraPrompt)
          : viewModel.text(.miraAskAgain)
      )
      .font(.system(.caption, design: .rounded).weight(.bold))
      .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 9)
  }

  @ViewBuilder
  private func content(interactiveDictation: Bool) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        Image(systemName: "sparkles")
          .font(.caption.weight(.bold))
          .foregroundStyle(SorbetWatchPalette.blue.ink.color)
          .padding(6)
          .background(
            Circle().fill(SorbetWatchPalette.blue.activeFill(calmColors: viewModel.calmColors).color)
          )
        Text(viewModel.text(.miraTitle))
          .font(.system(.headline, design: .rounded).weight(.bold))
          .foregroundStyle(SorbetWatchPalette.foreground.color)
        Spacer(minLength: 0)
      }

      if let prompt = viewModel.miraLastPrompt {
        Text(prompt)
          .font(.system(.caption2, design: .rounded).weight(.semibold))
          .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
          .padding(.horizontal, 8)
          .padding(.vertical, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
              .fill(SorbetWatchPalette.surfaceSunken.color)
          )
      }

      if viewModel.isAskingMira && viewModel.miraReply.isEmpty {
        HStack(spacing: 8) {
          ProgressView()
            .tint(SorbetWatchPalette.blue.ink.color)
          Text(viewModel.text(.miraThinking))
            .font(.system(.caption, design: .rounded))
            .foregroundStyle(SorbetWatchPalette.mutedForeground.color)
        }
        .padding(.vertical, 6)
      } else if !viewModel.miraReply.isEmpty {
        // Sorbet rule: Mira replies render without a chat bubble so answers read like a document.
        Text(viewModel.miraReply)
          .font(.system(.footnote, design: .rounded))
          .foregroundStyle(SorbetWatchPalette.foreground.color)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 2)
      }

      if let error = viewModel.miraError {
        Text(error)
          .font(.system(.caption2, design: .rounded).weight(.semibold))
          .foregroundStyle(SorbetWatchPalette.red.ink.color)
          .padding(.horizontal, 8)
          .padding(.vertical, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            RoundedRectangle(cornerRadius: SorbetWatchPalette.rowCornerRadius, style: .continuous)
              .fill(SorbetWatchPalette.red.calm.color)
          )
      }

      if interactiveDictation {
        TextFieldLink(prompt: Text(viewModel.text(.miraPrompt))) {
          askButtonLabel
        } onSubmit: { spoken in
          Task {
            await viewModel.askMira(prompt: spoken)
          }
        }
        .buttonStyle(.plain)
        .foregroundStyle(SorbetWatchPalette.primaryForeground.color)
        .background(Capsule().fill(SorbetWatchPalette.primary.color))
        .disabled(viewModel.isAskingMira)
      } else {
        askButtonLabel
          .foregroundStyle(SorbetWatchPalette.primaryForeground.color)
          .background(Capsule().fill(SorbetWatchPalette.primary.color))
      }
    }
    .padding(.horizontal, 4)
    .padding(.bottom, 12)
  }
}
