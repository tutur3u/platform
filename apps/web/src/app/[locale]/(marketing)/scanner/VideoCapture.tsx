'use client';

import { Button } from '@ncthub/ui/button';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoCaptureProps {
  handleNewStudent: (name: string, studentNumber: string) => void;
}

export default function VideoCapture({ handleNewStudent }: VideoCaptureProps) {
  const [error, setError] = useState<string | null>(null);
  const [autoCapture, setAutoCapture] = useState<boolean>(false);
  const [cameraOn, setCameraOn] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

        setError('Can not access the webcam.');
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

  const toggleAutoCapture = () => {
    if (cameraOn) {
      setAutoCapture((prev) => !prev);
    } else {
      setAutoCapture(false);
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
            setError(null);
          } else {
            setError('Could not detect student information from the ID card.');
          }
        } catch {
          setError('Could not detect student information from the ID card.');
        }
      }
    }
  }, [handleNewStudent, setError]);

  useEffect(() => {
    if (!cameraOn) {
      setAutoCapture(false);
    }
  }, [cameraOn]);

  useEffect(() => {
    if (autoCapture) {
      const intervalId = setInterval(() => {
        captureFrame();
      }, 1000);

      return () => clearInterval(intervalId);
    }
  }, [autoCapture, captureFrame]);

  return (
    <>
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full rounded-lg border border-gray-300 object-cover shadow-md"
        ></video>

        {cameraOn && (
          <div
            className="absolute border-4 border-red-500"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '75%',
              height: '65%',
              pointerEvents: 'none',
            }}
          ></div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden"></canvas>

      <div className="my-4 flex justify-center gap-2">
        <Button
          onClick={toggleCamera}
          className={`rounded-lg px-4 py-2 font-medium ${
            cameraOn
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          {cameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
        </Button>
        <Button
          onClick={toggleAutoCapture}
          className={`rounded-lg px-4 py-2 font-medium ${
            !cameraOn && 'cursor-not-allowed opacity-50'
          } ${
            autoCapture
              ? `bg-red-500 ${cameraOn && 'hover:bg-red-600'} text-white`
              : ``
          } `}
          disabled={!cameraOn}
        >
          {autoCapture ? 'Stop Auto Capture' : 'Start Auto Capture'}
        </Button>
      </div>

      {error && (
        <div className="text-center font-medium text-red-500">{error}</div>
      )}
    </>
  );
}
