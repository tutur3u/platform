'use client';

import { Button } from '@ncthub/ui/button';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import {
  Camera,
  CameraOff,
  Scan,
  Zap,
  AlertCircle
} from '@ncthub/ui/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@ncthub/utils/format';

interface VideoCaptureProps {
  handleNewStudent: (name: string, studentNumber: string) => void;
}

export default function VideoCapture({ handleNewStudent }: VideoCaptureProps) {
  const [cameraOn, setCameraOn] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

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
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;

          videoRef.current.onloadedmetadata = () => {
            setIsReady(true);
          };
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
      setIsReady(false);
    }
  };

  const startCapture = () => {
    if (cameraOn && !capturing && isReady) {
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

        const imageData = canvasRef.current.toDataURL('image/webp', 0.8);
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
              title: 'Student Information Detected',
              description: `Found: ${data.name} (${data.studentNumber})`
            });
          } else {
            toast({
              title: 'No Student Information Found',
              description: 'Please ensure the ID card is clearly visible and try again.',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('Capture error:', error);

          toast({
            title: 'Processing Failed',
            description: 'Unable to process the image. Please check your connection and try again.',
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
  }, [handleNewStudent, toast]);

  useEffect(() => {
    if (!cameraOn) {
      setCapturing(false);
      setIsReady(false);
    }
  }, [cameraOn]);

  return (
    <div className="space-y-6">
      {/* Video Container */}
      <div className={cn(
        "relative aspect-video rounded-2xl overflow-hidden border-4 transition-all duration-300",
        cameraOn
          ? "border-blue-500 shadow-lg shadow-blue-500/25"
          : "border-gray-200"
      )}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Camera Off Placeholder */}
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-dynamic-light-gray rounded-full flex items-center justify-center">
                <CameraOff className="h-8 w-8 text-dynamic-gray" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-gray-700">Camera is Off</p>
                <p className="text-sm text-gray-500">Click "Turn On Camera" to start scanning</p>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Overlay */}
        {cameraOn && isReady && (
          <>
            {/* Scanning Grid */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 w-80 h-48 -translate-x-1/2 -translate-y-1/2">
                {/* Corner Brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg shadow-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg shadow-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg shadow-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg shadow-lg"></div>

                {/* Center Crosshair */}
                <div className="absolute top-1/2 left-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2">
                  <div className="w-full h-0.5 bg-white shadow-lg"></div>
                  <div className="w-0.5 h-full bg-white shadow-lg absolute top-0 left-1/2 -translate-x-1/2"></div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="absolute top-4 left-4 right-4">
              <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm text-center">
                <Scan className="inline h-4 w-4 mr-2" />
                Position student ID card within the frame
              </div>
            </div>
          </>
        )}

        {/* Processing Overlay */}
        {capturing && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm gap-2 flex flex-col items-center justify-center">
            <div className="relative">
              <LoadingIndicator className="h-12 w-12 text-white mx-auto" />
            </div>
            <div className="space-y-2 text-center">
              <p className="text-lg font-semibold text-white">Processing Image...</p>
              <p className="text-sm text-white/80">Extracting student information</p>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Control Buttons */}
      <div className="flex gap-4">
        <Button
          onClick={toggleCamera}
          size="lg"
          variant={cameraOn ? "destructive" : "default"}
          className={cn(
            "flex-1 h-14 text-base font-medium transition-all duration-200",
            cameraOn
              ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/25"
              : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25"
          )}
        >
          {cameraOn ? (
            <>
              <CameraOff className="h-5 w-5 mr-2" />
              Turn Off Camera
            </>
          ) : (
            <>
              <Camera className="h-5 w-5 mr-2" />
              Turn On Camera
            </>
          )}
        </Button>

        <Button
          onClick={startCapture}
          size="lg"
          disabled={!cameraOn || capturing || !isReady}
          className={cn(
            "flex-1 h-14 text-base font-medium transition-all duration-200",
            "bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg",
            (!cameraOn || capturing || !isReady) && "opacity-50 cursor-not-allowed"
          )}
        >
          {capturing ? (
            <>
              <LoadingIndicator className="h-5 w-5 mr-2" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5 mr-2" />
              Capture ID
            </>
          )}
        </Button>
      </div>

      {/* Status Messages */}
      {cameraOn && !isReady && (
        <div className="flex items-center justify-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <span className="text-amber-800 font-medium">Camera is starting up...</span>
        </div>
      )}
    </div>
  );
}
