'use client';


import { Button } from '@repo/ui/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface ChallengeButtonProps {
  onClick: () => void;
}

const ChallengeButton: React.FC<ChallengeButtonProps> = ({ onClick }) => {
  return (
    <Button className="w-full gap-2" onClick={onClick}>
      Start Challenge <ArrowRight className="h-4 w-4" />
    </Button>
  );
};

export default ChallengeButton;
