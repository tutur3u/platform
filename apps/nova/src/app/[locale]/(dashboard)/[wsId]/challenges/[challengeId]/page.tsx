import React from 'react';
import { getChallenges } from '../challenges';
interface Props{
    params: Promise<{
        challengeId: string;
    }>;
}
export default async function page({params}: Props) {

    const {challengeId}= await params;

  return (
    <div>
      
    </div>
  )
}
