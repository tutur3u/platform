'use client';

import { Button } from '@ncthub/ui/button';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import {
  AlertCircle,
  Camera,
  CameraOff,
  ChevronDown,
  Scan,
  Video,
  Zap,
} from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoCaptureProps {
  onNewStudent: (name: string, studentNumber: string) => void;
}

export default function VideoCapture({ onNewStudent }: VideoCaptureProps) {
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>(
    []
  );
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState<boolean>(false);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  const { toast } = useToast();

  const getSelectedDeviceIdLabel = () => {
    const device = availableDevices.find(
      (d) => d.deviceId === selectedDeviceId
    );
    return device?.label || 'Select Camera';
  };

  // Detect if the camera is front-facing from track settings
  const detectFrontCameraFromStream = (stream: MediaStream) => {
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    const settings = videoTracks[0]?.getSettings();
    const facing = settings?.facingMode;

    return facing === 'user';
  };

  // Enumerate available camera devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      );

      setAvailableDevices(videoDevices);

      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0]?.deviceId || null);
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  }, [selectedDeviceId]);

  const startCamera = async (deviceId: string) => {
    setCameraOn(true);

    try {
      const devices = navigator.mediaDevices;
      if (!devices) {
        throw new Error('No media devices found');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      // Use selected device if available, otherwise use facingMode
      if (deviceId) {
        (constraints.video as MediaTrackConstraints).deviceId = {
          exact: deviceId,
        };
      } else {
        (constraints.video as MediaTrackConstraints).facingMode = 'environment';
      }

      const stream = await devices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // Detect camera type from actual stream
        setIsFrontCamera(detectFrontCameraFromStream(stream));

        videoRef.current.onloadedmetadata = () => {
          setIsReady(true);
        };
      }
    } catch (error) {
      console.error(error);
      setCameraOn(false);

      toast({
        title: 'Could not access the webcam',
        description: 'Could not access the webcam.',
        variant: 'destructive',
      });
    }
  };

  const stopCamera = () => {
    setCameraOn(false);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }
  };

  const toggleCamera = async () => {
    if (!cameraOn) {
      await startCamera(selectedDeviceId || '');
    } else {
      stopCamera();
    }
  };

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);

    // If camera is currently on, restart with new device
    if (cameraOn) {
      stopCamera();

      // Small delay to ensure cleanup, then restart with new device
      setTimeout(() => {
        startCamera(deviceId);
      }, 100);
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

  const captureFrame = async () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        const imageData = canvasRef.current.toDataURL('image/webp', 0.8);
        try {
          const ocrURL =
            process.env.NEXT_PUBLIC_OCR_SERVICE_URL || 'http://localhost:5000';
          const response = await fetch(`${ocrURL}/capture`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image_data: imageData }),
          });

          if (!response.ok) {
            throw new Error('Failed to process image');
          }

          const data = await response.json();

          if (data.name && data.studentNumber) {
            onNewStudent(data.name, data.studentNumber);
            toast({
              title: 'Student Information Detected',
              description: `Found: ${data.name} (${data.studentNumber})`,
            });
          } else {
            toast({
              title: 'No Student Information Found',
              description:
                'Please ensure the ID card is clearly visible and try again.',
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('Capture error:', error);

          toast({
            title: 'Processing Failed',
            description:
              'Unable to process the image. Please check your connection and try again.',
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
  };

  // Initialize devices on component mount
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  useEffect(() => {
    if (!cameraOn) {
      setCapturing(false);
      setIsReady(false);
    }
  }, [cameraOn]);

  return (
    <div className="space-y-6">
      {/* Camera Device Selection */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-lg">Camera Selection</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-64 justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Video className="h-4 w-4" />
                <span className="truncate">{getSelectedDeviceIdLabel()}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {availableDevices.map((device) => (
              <DropdownMenuItem
                key={device.deviceId}
                onClick={() => handleDeviceChange(device.deviceId)}
                className={cn(
                  'cursor-pointer',
                  selectedDeviceId === device.deviceId && 'bg-accent'
                )}
              >
                <Video className="mr-2 h-4 w-4" />
                <span className="truncate">{device.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Video Container */}
      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-2xl border-4 transition-all duration-300',
          cameraOn
            ? 'border-dynamic-blue shadow-dynamic-blue/25 shadow-lg'
            : 'border-border'
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'h-full w-full object-cover',
            isFrontCamera && 'scale-x-[-1]'
          )}
        />

        {/* Camera Off Placeholder */}
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dynamic-light-gray">
                <CameraOff className="h-8 w-8 text-dynamic-gray" />
              </div>
              <div className="hidden space-y-2 sm:block">
                <p className="font-medium text-foreground text-lg">
                  Camera is Off
                </p>
                <p className="text-muted-foreground text-sm">
                  Click "Turn On Camera" to start scanning
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Overlay */}
        {cameraOn && isReady && (
          <>
            {/* Scanning Grid */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-1/2 left-1/2 h-48 w-80 -translate-x-1/2 -translate-y-1/2">
                {/* Corner Brackets */}
                <div className="absolute top-0 left-0 h-8 w-8 rounded-tl-lg border-primary-foreground border-t-4 border-l-4 shadow-lg"></div>
                <div className="absolute top-0 right-0 h-8 w-8 rounded-tr-lg border-primary-foreground border-t-4 border-r-4 shadow-lg"></div>
                <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-primary-foreground border-b-4 border-l-4 shadow-lg"></div>
                <div className="absolute right-0 bottom-0 h-8 w-8 rounded-br-lg border-primary-foreground border-r-4 border-b-4 shadow-lg"></div>

                {/* Center Crosshair */}
                <div className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2">
                  <div className="h-0.5 w-full bg-primary-foreground shadow-lg"></div>
                  <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-primary-foreground shadow-lg"></div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="absolute top-4 right-4 left-4">
              <div className="rounded-lg bg-foreground/60 px-4 py-2 text-center text-primary-foreground text-sm backdrop-blur-sm">
                <Scan className="mr-2 inline h-4 w-4" />
                Position student ID card within the frame
              </div>
            </div>
          </>
        )}

        {/* Processing Overlay */}
        {capturing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/60 backdrop-blur-sm">
            <div className="relative">
              <LoadingIndicator className="mx-auto h-12 w-12 text-primary-foreground" />
            </div>
            <div className="space-y-2 text-center">
              <p className="font-semibold text-lg text-primary-foreground">
                Processing Image...
              </p>
              <p className="text-primary-foreground/80 text-sm">
                Extracting student information
              </p>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Control Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <Button
          onClick={toggleCamera}
          size="lg"
          variant={cameraOn ? 'destructive' : 'default'}
          className={cn(
            'h-14 w-full font-medium text-base transition-all duration-200',
            cameraOn
              ? 'bg-destructive shadow-destructive/25 shadow-lg hover:bg-destructive/90'
              : 'bg-dynamic-blue text-primary-foreground shadow-dynamic-blue/25 shadow-lg hover:bg-dynamic-blue/90'
          )}
        >
          {cameraOn ? (
            <>
              <CameraOff className="mr-2 h-5 w-5" />
              Turn Off Camera
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" />
              Turn On Camera
            </>
          )}
        </Button>

        <Button
          onClick={startCapture}
          size="lg"
          disabled={!cameraOn || capturing || !isReady}
          className={cn(
            'h-14 w-full font-medium text-base transition-all duration-200',
            'bg-linear-to-r from-dynamic-purple to-dynamic-indigo text-primary-foreground shadow-lg hover:opacity-90'
          )}
        >
          {capturing ? (
            <>
              <LoadingIndicator className="mr-2 h-5 w-5" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Capture ID
            </>
          )}
        </Button>
      </div>

      {/* Status Messages */}
      {cameraOn && !isReady && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dynamic-light-orange/40 bg-dynamic-light-orange/15 p-4">
          <AlertCircle className="h-5 w-5 text-dynamic-orange" />
          <span className="font-medium text-dynamic-orange">
            Camera is starting up...
          </span>
        </div>
      )}
    </div>
  );
}
