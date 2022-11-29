import { Image } from '@mantine/core';
import React from 'react';

interface AuthQRProps {
  disabled?: boolean;
}

const AuthQR = ({ disabled = false }: AuthQRProps) => {
  if (disabled) return null;

  return (
    <div className="hidden w-full md:block md:max-w-md">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Image
          width={150}
          height={150}
          src="/media/logos/light.png"
          alt="QR code"
        />
        <div className="font-semibold">Log in with QR code</div>
      </div>
    </div>
  );
};

export default AuthQR;
