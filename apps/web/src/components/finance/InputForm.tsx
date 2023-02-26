import { Select } from '@mantine/core';
import AdjustmentInput from './AdjustmentInput';
import Input from './Input';
import TransferInput from './TransferInput';

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
        <div>Expense</div>
        <Input type="Expense" />
        <div>Lennd</div>
        <Input type="Lend" />
        <div>Borrow</div>
        <Input type="Borrow" />
        <div>Income</div>
        <Input type="Income" />
        <div>Transfer</div>
        <TransferInput />
        <div>Adjustment</div>
        <AdjustmentInput />
      </div>
    </>
  );
}
