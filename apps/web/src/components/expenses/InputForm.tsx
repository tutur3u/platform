import { Select, Textarea, TextInput } from "@mantine/core";

export default function InputForm() {
  return (
    <>
      <div className="mt-8 flex flex-col gap-4">
        <Select
          defaultValue="Expense"
          data={[
            'Expense',
            'Income',
            'Lend',
            'Borrow',
            'Transfer',
            'Adjustment',
          ]}
        />
        <TextInput placeholder="Amount" />
        <Select
          placeholder="Category"
          searchable
          nothingFound="No options"
          data={['Food', 'Shopping', 'Food', 'Tuition fee']}
        />
        <Textarea placeholder="Description" autosize minRows={2} maxRows={4} />
        <div className="flex justify-end">
          <div className="h-fit w-fit rounded-md bg-yellow-300/30 p-2 text-black">
            Add transaction
          </div>
        </div>
      </div>
    </>
  );
}
