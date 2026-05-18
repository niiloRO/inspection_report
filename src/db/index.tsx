import { SQLiteProvider } from 'expo-sqlite';
import React from 'react';

import { migrateDatabase } from './migrations';

export { useSQLiteContext } from 'expo-sqlite';

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SQLiteProvider databaseName="inspection.db" onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}
