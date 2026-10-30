require 'minitest/autorun'
require 'tmpdir'
require 'pathname'
require 'fileutils'
require_relative '../ConsentFirebasePatches'

class FirebaseMessagingPatchTest < Minitest::Test
  PODFILE = File.expand_path('../Podfile', __dir__)
  SOURCE = <<~'OBJC'
    #import "FLTFirebaseMessagingPlugin.h"
    id autoInit = @([FIRMessaging messaging].isAutoInitEnabled);
    - (void)setupNotificationHandling {
      // We automatically register for remote notifications as part of startup.
      [self registerForRemoteNotifications];
    }
    - (void)messagingSetAutoInitEnabled:(id)arguments {
      messaging.autoInitEnabled = enabled;
    }
    - (void)messagingRequestPermission:(id)arguments {
    }
  OBJC

  Reference = Struct.new(:path, :source_tree, :real_path)
  SourceFile = Struct.new(:file_ref)
  Phase = Struct.new(:files)
  Target = Struct.new(:name, :source_build_phase)

  def with_plugin(header_directory)
    Dir.mktmpdir('firebase-messaging-patch') do |directory|
      source = Pathname.new(directory).join('pub-cache/plugin/Sources/firebase_messaging/FLTFirebaseMessagingPlugin.m')
      FileUtils.mkdir_p(source.dirname)
      source.write(SOURCE)
      header = source.dirname.join(header_directory, 'FLTFirebaseMessagingPlugin.h')
      FileUtils.mkdir_p(header.dirname)
      header.write('// Public plugin header')
      ios = File.join(directory, 'ios')
      FileUtils.mkdir_p(File.join(ios, 'Pods'))
      reference = Reference.new(source.to_s, nil, source)
      target = Target.new('firebase_messaging', Phase.new([SourceFile.new(reference)]))
      contents = File.read(PODFILE)
      start = contents.index("    if target.name == 'firebase_messaging'")
      finish = contents.index("    ConsentFirebasePatches.install", start)
      apply = -> { eval(contents[start...finish], binding, File.join(ios, 'Podfile')) }
      yield source, header, reference, apply
    end
  end

  %w[include public/headers].each do |layout|
    define_method("test_generated_import_resolves_header_in_#{layout.tr('/', '_')}") do
      with_plugin(layout) do |source, header, reference, apply|
        apply.call
        patched = File.read(reference.path)
        imported = patched.match(/#import "([^"]+)"/)[1]
        assert File.file?(imported), 'Generated import must reference an existing header'
        assert_equal header.to_s, imported
        assert_equal SOURCE, source.read, 'Shared Pub cache must remain unchanged'
        launch, setter = patched.split('- (void)messagingSetAutoInitEnabled:')
        refute_includes launch, '[self registerForRemoteNotifications]'
        assert_equal 1, setter.scan('[self registerForRemoteNotifications]').length
      end
    end
  end

  def test_missing_header_fails_during_pod_install
    with_plugin('include') do |_source, header, _reference, apply|
      File.delete(header)
      error = assert_raises(RuntimeError, &apply)
      assert_includes error.message, 'Firebase Messaging header'
    end
  end
end
