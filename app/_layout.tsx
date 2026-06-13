// app/_layout.tsx
import { Stack } from 'expo-router';
import { DatabaseProvider } from '../context/DatabaseContext';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Интерактивная карта' }} />
        <Stack.Screen name="marker/[id]" options={{ title: 'Детали маркера' }} />
      </Stack>
    </DatabaseProvider>
  );
}