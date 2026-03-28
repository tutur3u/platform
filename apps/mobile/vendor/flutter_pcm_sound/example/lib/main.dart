import 'package:flutter/material.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return PcmSoundApp();
  }
}

class PcmSoundApp extends StatefulWidget {
  @override
  _PcmSoundAppState createState() => _PcmSoundAppState();
}

class _PcmSoundAppState extends State<PcmSoundApp> with WidgetsBindingObserver {
  static const int sampleRate = 48000;
  bool _isPlaying = false;
  bool _isActive = true; 
  int _remainingFrames = 0;
  MajorScale scale = MajorScale(sampleRate: sampleRate, noteDuration: 0.20);

  final GlobalKey<ScaffoldMessengerState> _scaffoldMessengerKey =
      GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this); // register observer

    FlutterPcmSound.setLogLevel(LogLevel.verbose).onError(_showError);
    FlutterPcmSound.setup(sampleRate: sampleRate, channelCount: 1).onError(_showError);
    FlutterPcmSound.setFeedThreshold(sampleRate ~/ 10).onError(_showError);
    FlutterPcmSound.setFeedCallback(_onFeed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this); // clean up
    FlutterPcmSound.release().onError(_showError);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    setState(() {
      _isActive = state == AppLifecycleState.resumed;
    });
  }

  bool _showError(Object? err, StackTrace st) {
    _scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(content: Text("feed failed: $err")),
    );
    return true;
  }

  void _onFeed(int remainingFrames) async {
    setState(() {
      _remainingFrames = remainingFrames;
    });

    // Only feed if playing AND app is active
    if (_isPlaying && _isActive) {
      List<int> frames = scale.generate(periods: 20);
      await FlutterPcmSound.feed(PcmArrayInt16.fromList(frames))
          .onError(_showError);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: _scaffoldMessengerKey,
      theme: ThemeData(primarySwatch: Colors.blue),
      home: Scaffold(
        appBar: AppBar(centerTitle: true, title: Text('Flutter PCM Sound')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              ElevatedButton(
                onPressed: () {
                  _isPlaying = true;
                  FlutterPcmSound.start();
                },
                child: Text('Play'),
              ),
              ElevatedButton(
                onPressed: () {
                  _isPlaying = false;
                },
                child: Text('Stop'),
              ),
              Text('$_remainingFrames Remaining Frames'),
            ],
          ),
        ),
      ),
    );
  }
}
