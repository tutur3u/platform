import { Stack } from 'expo-router';

export default function FinanceLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Finance',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="transactions/index"
        options={{
          title: 'Transactions',
          headerBackTitle: 'Finance',
        }}
      />
      <Stack.Screen
        name="transactions/[transactionId]"
        options={{
          title: 'Transaction Details',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="wallets/index"
        options={{
          title: 'Wallets',
          headerBackTitle: 'Finance',
        }}
      />
      <Stack.Screen
        name="wallets/[walletId]"
        options={{
          title: 'Wallet Details',
          headerBackTitle: 'Wallets',
        }}
      />
      <Stack.Screen
        name="categories"
        options={{
          title: 'Categories',
          headerBackTitle: 'Finance',
        }}
      />
    </Stack>
  );
}
