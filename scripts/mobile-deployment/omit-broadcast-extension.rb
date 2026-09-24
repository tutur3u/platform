#!/usr/bin/env ruby

require 'xcodeproj'

project_path = ARGV.fetch(0)
project = Xcodeproj::Project.open(project_path)
runner = project.targets.find { |target| target.name == 'Runner' }
abort 'Runner target is missing' unless runner

extension = project.targets.find { |target| target.name == 'LiveScreenBroadcast' }
abort 'LiveScreenBroadcast target is missing' unless extension

embed_phase = runner.copy_files_build_phases.find do |phase|
  phase.name == 'Embed Live Broadcast Extension'
end
abort 'Live broadcast embed phase is missing' unless embed_phase

dependency = runner.dependencies.find { |item| item.target == extension }
abort 'Live broadcast target dependency is missing' unless dependency

embed_phase.remove_from_project
dependency.remove_from_project
project.save

abort 'Live broadcast extension still embeds in Runner' if runner.copy_files_build_phases.any? do |phase|
  phase.files_references.any? { |file| file.path == 'LiveScreenBroadcast.appex' }
end

puts 'Omitted LiveScreenBroadcast from the iOS TestFlight Runner target.'
