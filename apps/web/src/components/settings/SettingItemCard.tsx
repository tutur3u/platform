import { Divider } from '@mantine/core';

interface Props {
  title: string;
  description: string;
  saving?: boolean;

  comingSoon?: boolean;

  onSave?: () => void;

  children: React.ReactNode;
}

const SettingItemCard = ({
  title,
  description,
  saving,
  comingSoon,
  onSave,
  children,
}: Props) => {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
      <div className="mb-1 text-2xl font-bold">{title}</div>
      <div className="mb-4 font-semibold text-zinc-500">{description}</div>

      <div className="h-full" />

      {children}

      {(onSave || comingSoon) && (
        <>
          <Divider className="my-4" />
          {comingSoon ? (
            <div className="flex cursor-not-allowed items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300/30">
              Coming soon
            </div>
          ) : (
            <div
              onClick={onSave}
              className="flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
            >
              {saving ? 'Saving...' : 'Save'}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettingItemCard;
