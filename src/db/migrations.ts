import type { SQLiteDatabase } from 'expo-sqlite';

import { CREATE_TABLES } from './schema';

const CURRENT_VERSION = 1;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = result?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(CREATE_TABLES);
    await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION}`);
  }
}
