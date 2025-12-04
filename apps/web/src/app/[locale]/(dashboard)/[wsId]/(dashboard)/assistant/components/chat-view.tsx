'use client';

import { Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRef, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import ControlTray from './control-tray/control-tray';
import Logger from './logger/logger';
import { VisualizerPanel } from './visualizer-panel';

export default function ChatView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const { connected, client } = useLiveAPIContext();
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!message.trim()) return;
    client.send([{ text: message }]);
    setMessage('');
  };

  return (
    <div className="flex h-full w-full">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Messages Area - Reduce bottom padding to make room for controls */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="mx-auto max-w-3xl">
            {!connected ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-red-500/50" />
                  <p className="text-sm">Disconnected</p>
                </div>
              </div>
            ) : (
              <Logger filter="conversations" />
            )}
          </div>
        </div>

        {/* Fixed Bottom Section */}
        <div className="flex-none border-border/50 border-t bg-background/95 backdrop-blur-md">
          {/* Control Tray */}
          <div className="border-border/50 border-b py-4">
            <div className="mx-auto max-w-3xl px-6">
              <ControlTray
                videoRef={videoRef}
                supportsVideo={true}
                onVideoStreamChange={setVideoStream}
              />
            </div>
          </div>

          {/* Chat Input */}
          <div className="py-4">
            <div className="mx-auto max-w-3xl px-6">
              <div className="relative">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="min-h-[120px] w-full resize-none rounded-xl bg-muted/20 pr-12 ring-blue-500/50 focus:ring-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={!connected}
                />
                <Button
                  size="icon"
                  className="absolute right-3 bottom-3 h-9 w-9"
                  onClick={handleSend}
                  disabled={!connected || !message.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visualizer Panel */}
      <VisualizerPanel videoRef={videoRef} videoStream={videoStream} />
    </div>
  );
}
