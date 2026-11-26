#!/usr/bin/env swift
import Foundation

// Omits the embedded TuturuuuWatch target from Runner when manual TestFlight signing
// does not have watch/widget App Store provisioning profiles configured in the vault.

let args = CommandLine.arguments
guard args.count == 2 else {
  FileHandle.standardError.write(Data("Usage: omit-watch-targets.swift <path/to/Runner.xcodeproj>\n".utf8))
  exit(1)
}

let projectURL = URL(fileURLWithPath: args[1]).appendingPathComponent("project.pbxproj")
guard var contents = try? String(contentsOf: projectURL, encoding: .utf8) else {
  FileHandle.standardError.write(Data("Failed to read \(projectURL.path)\n".utf8))
  exit(1)
}

let embedPhaseId = "W10000010000000000000040"
let watchDependencyId = "W10000010000000000000042"
let embedBuildFileId = "W10000010000000000000041"

guard contents.contains(embedPhaseId), contents.contains(watchDependencyId) else {
  FileHandle.standardError.write(Data("Watch embed phase or target dependency not found in project.pbxproj\n".utf8))
  exit(1)
}

func removeLinesContaining(_ token: String, in text: inout String) {
  let filtered = text
    .split(separator: "\n", omittingEmptySubsequences: false)
    .filter { !$0.contains(token) }
  text = filtered.joined(separator: "\n")
}

func removeBlock(startingWith header: String, in text: inout String) {
  guard let startRange = text.range(of: header) else { return }
  guard let endRange = text.range(of: "\t\t};\n", range: startRange.upperBound..<text.endIndex) else { return }
  text.removeSubrange(startRange.lowerBound..<endRange.upperBound)
}

removeBlock(startingWith: "\t\t\(embedPhaseId) /* Embed Watch Content */ = {", in: &contents)
removeBlock(startingWith: "\t\t\(watchDependencyId) /* PBXTargetDependency */ = {", in: &contents)
removeLinesContaining(embedPhaseId, in: &contents)
removeLinesContaining(watchDependencyId, in: &contents)
removeLinesContaining(embedBuildFileId, in: &contents)

guard !contents.contains("Embed Watch Content"), !contents.contains(watchDependencyId) else {
  FileHandle.standardError.write(Data("Failed to remove Watch embed references from project.pbxproj\n".utf8))
  exit(1)
}

try contents.write(to: projectURL, atomically: true, encoding: .utf8)
print("Omitted TuturuuuWatch from the iOS TestFlight Runner target.")
