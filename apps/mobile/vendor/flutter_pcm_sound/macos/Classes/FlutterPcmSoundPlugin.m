#import "FlutterPcmSoundPlugin.h"
#import <AudioToolbox/AudioToolbox.h>

#if TARGET_OS_IOS
#import <AVFoundation/AVFoundation.h>
#endif

#define kOutputBus 0
#define NAMESPACE @"flutter_pcm_sound"

typedef NS_ENUM(NSUInteger, LogLevel) {
    none = 0,
    error = 1,
    standard = 2,
    verbose = 3,
};

@interface FlutterPcmSoundPlugin ()
@property(nonatomic) NSObject<FlutterPluginRegistrar> *registrar;
@property(nonatomic) FlutterMethodChannel *mMethodChannel;
@property(nonatomic) LogLevel mLogLevel;
@property(nonatomic) AudioComponentInstance mAudioUnit;
@property(nonatomic) NSMutableData *mSamples;
@property(nonatomic) int mNumChannels; 
@property(nonatomic) int mFeedThreshold; 
@property(nonatomic) NSUInteger mTotalFeeds;
@property(nonatomic) NSUInteger mLastLowBufferFeed;
@property(nonatomic) NSUInteger mLastZeroFeed;
@property(nonatomic) bool mDidSetup;
@property(nonatomic) BOOL mIsAppActive;
@property(nonatomic) BOOL mAllowBackgroundAudio;
@end

@implementation FlutterPcmSoundPlugin

+ (void)registerWithRegistrar:(NSObject<FlutterPluginRegistrar> *)registrar
{
    FlutterMethodChannel *methodChannel = [FlutterMethodChannel methodChannelWithName:NAMESPACE @"/methods"
                                                                    binaryMessenger:[registrar messenger]];

    FlutterPcmSoundPlugin *instance = [[FlutterPcmSoundPlugin alloc] init];
    instance.mMethodChannel = methodChannel;
    instance.mLogLevel = verbose;
    instance.mSamples = [NSMutableData new];
    instance.mFeedThreshold = 8000;
    instance.mTotalFeeds = 0;
    instance.mLastLowBufferFeed = 0;
    instance.mLastZeroFeed = 0;
    instance.mDidSetup = false;
    instance.mIsAppActive = true;
    instance.mAllowBackgroundAudio = false;

#if TARGET_OS_IOS
    NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
    [nc addObserver:instance selector:@selector(onWillResignActive:) name:UIApplicationWillResignActiveNotification object:nil];
    [nc addObserver:instance selector:@selector(onDidBecomeActive:) name:UIApplicationDidBecomeActiveNotification object:nil];
#endif

    [registrar addMethodCallDelegate:instance channel:methodChannel];
}

#if TARGET_OS_IOS
- (void)onWillResignActive:(NSNotification *)note {
  self.mIsAppActive = NO;
}

- (void)onDidBecomeActive:(NSNotification *)note {
  self.mIsAppActive = YES;
}
#endif

- (void)handleMethodCall:(FlutterMethodCall *)call result:(FlutterResult)result
{
    @try
    {
        if ([@"setLogLevel" isEqualToString:call.method])
        {
            NSDictionary *args = (NSDictionary*)call.arguments;
            NSNumber *logLevelNumber  = args[@"log_level"];

            self.mLogLevel = (LogLevel)[logLevelNumber integerValue];

            result(@YES);
        }
        else if ([@"setup" isEqualToString:call.method])
        {
            NSDictionary *args = (NSDictionary*)call.arguments;
            NSNumber *sampleRate       = args[@"sample_rate"];
            NSNumber *numChannels      = args[@"num_channels"];
#if TARGET_OS_IOS
            NSString *iosAudioCategory = args[@"ios_audio_category"];
            self.mAllowBackgroundAudio = [args[@"ios_allow_background_audio"] boolValue];
#endif

            self.mNumChannels = [numChannels intValue];

#if TARGET_OS_IOS
            // iOS audio category
            AVAudioSessionCategory category = AVAudioSessionCategorySoloAmbient;
            if ([iosAudioCategory isEqualToString:@"ambient"]) {
                category = AVAudioSessionCategoryAmbient;
            } else if ([iosAudioCategory isEqualToString:@"soloAmbient"]) {
                category = AVAudioSessionCategorySoloAmbient;
            } else if ([iosAudioCategory isEqualToString:@"playback"]) {
                category = AVAudioSessionCategoryPlayback;
            }
            else if ([iosAudioCategory isEqualToString:@"playAndRecord"]) {
                category = AVAudioSessionCategoryPlayAndRecord;
            }
            
            // Set the AVAudioSession category based on the string value
            NSError *error = nil;
            [[AVAudioSession sharedInstance] setCategory:category error:&error];
            if (error) {
                NSLog(@"Error setting AVAudioSession category: %@", error);
                result([FlutterError errorWithCode:@"AVAudioSessionError" 
                                        message:@"Error setting AVAudioSession category" 
                                        details:[error localizedDescription]]);
                return;
            }
            
            // Activate the audio session
            [[AVAudioSession sharedInstance] setActive:YES error:&error];
            if (error) {
                NSLog(@"Error activating AVAudioSession: %@", error);
                result([FlutterError errorWithCode:@"AVAudioSessionError" 
                                        message:@"Error activating AVAudioSession" 
                                        details:[error localizedDescription]]);
                return;
            }
#endif

            // cleanup
            if (_mAudioUnit != nil) {
                [self cleanup];
            }

            // create
            AudioComponentDescription desc;
            desc.componentType = kAudioUnitType_Output;
#if TARGET_OS_IOS
            desc.componentSubType = kAudioUnitSubType_RemoteIO;
#else // MacOS
            desc.componentSubType = kAudioUnitSubType_DefaultOutput;
#endif
            desc.componentFlags = 0;
            desc.componentFlagsMask = 0;
            desc.componentManufacturer = kAudioUnitManufacturer_Apple;

            AudioComponent inputComponent = AudioComponentFindNext(NULL, &desc);
            OSStatus status = AudioComponentInstanceNew(inputComponent, &_mAudioUnit);
            if (status != noErr) {
                NSString* message = [NSString stringWithFormat:@"AudioComponentInstanceNew failed. OSStatus: %@", @(status)];
                result([FlutterError errorWithCode:@"AudioUnitError" message:message details:nil]);
                return;
            }

            // set stream format
            AudioStreamBasicDescription audioFormat;
            audioFormat.mSampleRate = [sampleRate intValue];
            audioFormat.mFormatID = kAudioFormatLinearPCM;
            audioFormat.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
            audioFormat.mFramesPerPacket = 1;
            audioFormat.mChannelsPerFrame = self.mNumChannels;
            audioFormat.mBitsPerChannel = 16;
            audioFormat.mBytesPerFrame = self.mNumChannels * (audioFormat.mBitsPerChannel / 8);
            audioFormat.mBytesPerPacket = audioFormat.mBytesPerFrame * audioFormat.mFramesPerPacket;

            status = AudioUnitSetProperty(_mAudioUnit,
                                    kAudioUnitProperty_StreamFormat,
                                    kAudioUnitScope_Input,
                                    kOutputBus,
                                    &audioFormat,
                                    sizeof(audioFormat));
            if (status != noErr) {
                NSString* message = [NSString stringWithFormat:@"AudioUnitSetProperty StreamFormat failed. OSStatus: %@", @(status)];
                result([FlutterError errorWithCode:@"AudioUnitError" message:message details:nil]);
                return;
            }

            // set callback
            AURenderCallbackStruct callback;
            callback.inputProc = RenderCallback;
            callback.inputProcRefCon = (__bridge void *)(self);

            status = AudioUnitSetProperty(_mAudioUnit,
                                kAudioUnitProperty_SetRenderCallback,
                                kAudioUnitScope_Global,
                                kOutputBus,
                                &callback,
                                sizeof(callback));
            if (status != noErr) {
                NSString* message = [NSString stringWithFormat:@"AudioUnitSetProperty SetRenderCallback failed. OSStatus: %@", @(status)];
                result([FlutterError errorWithCode:@"AudioUnitError" message:message details:nil]);
                return;
            }

            // initialize
            status = AudioUnitInitialize(_mAudioUnit);
            if (status != noErr) {
                NSString* message = [NSString stringWithFormat:@"AudioUnitInitialize failed. OSStatus: %@", @(status)];
                result([FlutterError errorWithCode:@"AudioUnitError" message:message details:nil]);
                return;
            }

            self.mDidSetup = true;
            
            result(@YES);
        }
        else if ([@"feed" isEqualToString:call.method])
        {
            // setup check
            if (self.mDidSetup == false) {
                result([FlutterError errorWithCode:@"Setup" message:@"must call setup first" details:nil]);
                return;
            }

            // If background audio is not allowed, feeding immediately after a lock→unlock
            // can cause AudioOutputUnitStart to fail with code 561015905 because the app is not
            // fully active yet. Rather than surfacing this transient error, we report success
            // and tell Dart the frames were consumed, prompting it to continue feeding.
            // This hides the temporary failure and keeps the API simple.
            if (!self.mIsAppActive && !self.mAllowBackgroundAudio) {
                @synchronized (self.mSamples) {[self.mSamples setLength:0];}
                [self.mMethodChannel invokeMethod:@"OnFeedSamples" arguments:@{@"remaining_frames": @(0)}];
                result(@YES);
                return;
            }

            NSDictionary *args = (NSDictionary*)call.arguments;
            FlutterStandardTypedData *buffer = args[@"buffer"];

            @synchronized (self.mSamples) {
                [self.mSamples appendData:buffer.data];
                self.mTotalFeeds += 1;
            }

            // start
            OSStatus status = AudioOutputUnitStart(_mAudioUnit);
            if (status != noErr) {
                NSString* message = [NSString stringWithFormat:@"AudioOutputUnitStart failed. OSStatus: %@", @(status)];
                result([FlutterError errorWithCode:@"AudioUnitError" message:message details:nil]);
                return;
            }

            result(@YES);
        }
        else if ([@"setFeedThreshold" isEqualToString:call.method])
        {
            NSDictionary *args = (NSDictionary*)call.arguments;
            NSNumber *feedThreshold = args[@"feed_threshold"];

            @synchronized (self.mSamples) {
                self.mFeedThreshold = [feedThreshold intValue];
            }

            result(@YES);
        }
        else if([@"release" isEqualToString:call.method])
        {
            [self cleanup];
            result(@YES);
        }
        else
        {
            result([FlutterError errorWithCode:@"functionNotImplemented" message:call.method details:nil]);
        }
    }
    @catch (NSException *e)
    {
        NSString *stackTrace = [[e callStackSymbols] componentsJoinedByString:@"\n"];
        NSDictionary *details = @{@"stackTrace": stackTrace};
        result([FlutterError errorWithCode:@"iosException" message:[e reason] details:details]);
    }
}

- (void)cleanup
{
    if (_mAudioUnit != nil) {
        AudioOutputUnitStop(_mAudioUnit);
        AudioUnitUninitialize(_mAudioUnit);
        AudioComponentInstanceDispose(_mAudioUnit);
        _mAudioUnit = nil;
        self.mDidSetup = false;
    }
    @synchronized (self.mSamples) {
        [self.mSamples setLength:0];
    }
}

- (void)stopAudioUnit
{
    if (_mAudioUnit != nil) {
        UInt32 isRunning = 0;
        UInt32 size = sizeof(isRunning);
        OSStatus status = AudioUnitGetProperty(_mAudioUnit,
                                            kAudioOutputUnitProperty_IsRunning,
                                            kAudioUnitScope_Global,
                                            0,
                                            &isRunning,
                                            &size);
        if (status != noErr) {
            NSLog(@"AudioUnitGetProperty IsRunning failed. OSStatus: %@", @(status));
            return;
        }
        if (isRunning) {
            status = AudioOutputUnitStop(_mAudioUnit);
            if (status != noErr) {
                NSLog(@"AudioOutputUnitStop failed. OSStatus: %@", @(status));
            } else {
                NSLog(@"AudioUnit stopped because no more samples");
            }
        }
    }
}


static OSStatus RenderCallback(void *inRefCon,
                               AudioUnitRenderActionFlags *ioActionFlags,
                               const AudioTimeStamp *inTimeStamp,
                               UInt32 inBusNumber,
                               UInt32 inNumberFrames,
                               AudioBufferList *ioData)
{
    FlutterPcmSoundPlugin *instance = (__bridge FlutterPcmSoundPlugin *)(inRefCon);

    NSUInteger totalFeeds = 0;
    NSUInteger remainingFrames;
    NSUInteger feedThreshold = 0;

    @synchronized (instance.mSamples) {

        // clear
        memset(ioData->mBuffers[0].mData, 0, ioData->mBuffers[0].mDataByteSize);

        NSUInteger bytesToCopy = MIN(ioData->mBuffers[0].mDataByteSize, [instance.mSamples length]);
        
        // provide samples
        memcpy(ioData->mBuffers[0].mData, [instance.mSamples bytes], bytesToCopy);

        // pop front bytes
        NSRange range = NSMakeRange(0, bytesToCopy);
        [instance.mSamples replaceBytesInRange:range withBytes:NULL length:0];

        // grab shared data
        remainingFrames = [instance.mSamples length] / (instance.mNumChannels * sizeof(short));
        totalFeeds = instance.mTotalFeeds;
        feedThreshold = (NSUInteger)instance.mFeedThreshold;
    }

    // check for events
    BOOL isLowBufferEvent = (remainingFrames <= feedThreshold) && (instance.mLastLowBufferFeed != totalFeeds);
    BOOL isZeroCrossingEvent = (remainingFrames == 0) && (instance.mLastZeroFeed != totalFeeds);

    // stop running, if needed
    if (remainingFrames == 0) {
        dispatch_async(dispatch_get_main_queue(), ^{
            @synchronized (instance.mSamples) { // re-check
                if ([instance.mSamples length] != 0) {return;}
            }
            [instance stopAudioUnit];
        });
    }

    // send events
    if (isLowBufferEvent || isZeroCrossingEvent) {
        if(isLowBufferEvent) {instance.mLastLowBufferFeed = totalFeeds;}
        if(isZeroCrossingEvent) {instance.mLastZeroFeed = totalFeeds;}
        NSDictionary *response = @{@"remaining_frames": @(remainingFrames)};
        dispatch_async(dispatch_get_main_queue(), ^{
            [instance.mMethodChannel invokeMethod:@"OnFeedSamples" arguments:response];
        });
    }

    return noErr;
}


@end
