import { Image } from '@mantine/core';
import React from 'react';

interface AuthQRProps {
  disabled?: boolean;
}

const AuthQR = ({ disabled = false }: AuthQRProps) => {
  if (disabled) return null;

  return (
    <div className="hidden md:block w-full md:max-w-md">
      <div className="flex justify-center items-center gap-2 h-full flex-col">
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
