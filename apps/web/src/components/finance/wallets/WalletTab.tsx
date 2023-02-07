interface WalletTabProps {
  name: string;
  balance: number;
}

export default function WalletTab({ name, balance }: WalletTabProps) {
  return (
    <>
      <div className="h-fit w-full rounded-lg bg-green-300/30 p-3 text-green-300 hover:cursor-pointer">
        <div className="font-semibold">{name}</div>
        <div className=" text-2xl font-bold">{`${balance} VND`}</div>
      </div>
    </>
  );
}
