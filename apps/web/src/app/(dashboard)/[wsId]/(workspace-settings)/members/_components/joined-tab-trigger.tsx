'use client'

import { TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";

interface Props {
  wsId: string;
    label: string;
}

export default function JoinedTabTrigger({wsId, label}:Props) {
    const router = useRouter();
  return <TabsTrigger
  value="joined"
  onClick={() => router.push(`/${wsId}/members`)}
>
  {label}
</TabsTrigger>;
}
