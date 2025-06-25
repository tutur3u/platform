'use client';

import { Button } from '@ncthub/ui/button';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoCaptureProps {
  handleNewStudent: (name: string, studentNumber: string) => void;
}

export default function VideoCapture({ handleNewStudent }: VideoCaptureProps) {
  const [cameraOn, setCameraOn] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { toast } = useToast();

  const toggleCamera = async () => {
    if (!cameraOn) {
      try {
        const devices = navigator.mediaDevices;
        if (!devices) {
          throw new Error('No media devices found');
        }

        const stream = await devices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }

        setCameraOn(true);
      } catch (error) {
        console.error(error);

        toast({
          title: 'Could not access the webcam',
          description: 'Could not access the webcam.',
          variant: 'destructive',
        });
        setCameraOn(false);
      }
    } else {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      setCameraOn(false);
    }
  };

  const startCapture = () => {
    if (cameraOn && !capturing) {
      setCapturing(true);
      // Pause the video to freeze the frame
      if (videoRef.current) {
        videoRef.current.pause();
      }
      captureFrame();
    }
  };

  const captureFrame = useCallback(async () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        const imageData = canvasRef.current.toDataURL('image/webp');
        try {
          const response = await fetch(`/api/capture`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageData }),
          });

          if (!response.ok) {
            throw new Error('Failed to process image');
          }

          const data = await response.json();

          if (data.name && data.studentNumber) {
            handleNewStudent(data.name, data.studentNumber);
            toast({
              title: 'Student information detected',
              description: 'Detected student information successfully',
            });
          } else {
            toast({
              title: 'Could not detect student information',
              description: 'Could not detect student information from the ID card.',
              variant: 'destructive',
            });
          }
        } catch {
          toast({
            title: 'Could not detect student information',
            description: 'Could not detect student information from the ID card.',
            variant: 'destructive',
          });
        } finally {
          setCapturing(false);
          // Resume the video
          if (videoRef.current) {
            videoRef.current.play();
          }
        }
      }
    }
  }, [handleNewStudent]);

  useEffect(() => {
    if (!cameraOn) {
      setCapturing(false);
    }
  }, [cameraOn]);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full rounded-lg border border-gray-300 object-cover shadow-md"
        ></video>

        {cameraOn && (
          <div className="absolute top-1/2 left-1/2 h-3/5 w-3/5 -translate-x-1/2 -translate-y-1/2 border-4 border-red-500"></div>
        )}

        {/* Dark overlay and loading indicator when capturing */}
        {capturing && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
            <div className="flex flex-col items-center gap-4">
              <LoadingIndicator className="h-8 w-8 text-white" />
              <span className="font-medium text-white">Processing...</span>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden"></canvas>

      <div className="flex justify-center gap-2">
        <Button
          onClick={toggleCamera}
          className={`rounded-lg px-4 py-2 font-medium ${cameraOn
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-green-500 text-white hover:bg-green-600'
            }`}
        >
          {cameraOn ? 'Turn Off' : 'Turn On'}
        </Button>
        <Button
          onClick={startCapture}
          className={`rounded-lg px-4 py-2 font-medium ${!cameraOn || capturing
            ? 'opacity-50'
            : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          disabled={!cameraOn || capturing}
        >
          {capturing ? 'Capturing...' : 'Capture'}
        </Button>
      </div>
    </div>
  );
}
