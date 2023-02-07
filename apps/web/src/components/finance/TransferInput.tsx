import { Select, Textarea, TextInput } from '@mantine/core';

export default function TransferInput() {
  return (
    <>
      <div className="mt-8 flex flex-col gap-4">
        <TextInput placeholder="Amount" />
        <Select
          placeholder="Category"
          searchable
          nothingFound="No options"
          data={['Food', 'Shopping', 'Food', 'Tuition fee']}
        />
        <Textarea placeholder="Description" autosize minRows={2} maxRows={4} />
        <div className="flex justify-end">
          <div className="h-fit w-fit rounded-md bg-zinc-800 p-2 text-white hover:cursor-pointer hover:bg-yellow-300/30 hover:text-yellow-300">
            Add transaction
          </div>
        </div>
      </div>
    </>
  );
}
