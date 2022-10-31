import { Image } from '@mantine/core';
import React from 'react';

interface AuthQRProps {
  className?: string;
}

const AuthQR = ({ className }: AuthQRProps) => {
  return (
    <div
      className={`${className} flex justify-center gap-3 items-center w-full md:max-w-md`}
    >
      <div className="flex justify-center items-center h-full flex-col">
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
