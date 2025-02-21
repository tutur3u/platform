export type EditorInfoProps = {
  characters: number;
  words: number;
};

export const EditorInfo = ({ characters, words }: EditorInfoProps) => {
  return (
    <div className="flex items-center gap-x-4 text-sm text-neutral-500">
      <div>{words} words</div>
      <div>{characters} characters</div>
    </div>
  );
};

EditorInfo.displayName = 'EditorInfo';
