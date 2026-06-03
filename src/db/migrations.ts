import type { SQLiteDatabase } from 'expo-sqlite';

import { CREATE_TABLES } from './schema';

const CURRENT_VERSION = 6;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = result?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(CREATE_TABLES);
    await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION}`);
  } else if (version === 1) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`CREATE TABLE IF NOT EXISTS groups (name TEXT PRIMARY KEY, sort_order INTEGER NOT NULL DEFAULT 0)`);
      await db.runAsync(`ALTER TABLE column_configs ADD COLUMN group_name TEXT`);
      await db.runAsync(`ALTER TABLE column_configs ADD COLUMN severity TEXT NOT NULL DEFAULT 'medium'`);
      await db.runAsync(`ALTER TABLE inspections ADD COLUMN supplier TEXT`);
      await db.runAsync(`ALTER TABLE inspections ADD COLUMN location TEXT`);
      await db.runAsync(`ALTER TABLE inspection_products ADD COLUMN units_inspected INTEGER NOT NULL DEFAULT 1`);
      await db.runAsync(`ALTER TABLE inspection_products ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 1`);
      await db.runAsync(`UPDATE inspection_point_configs SET severity = 'high' WHERE severity = 'critical'`);
      await db.runAsync(`UPDATE inspection_point_configs SET severity = 'medium' WHERE severity = 'major'`);
      await db.runAsync(`UPDATE inspection_point_configs SET severity = 'low' WHERE severity = 'minor'`);
      await db.execAsync(`PRAGMA user_version = 2`);
    });
  } else if (version === 2) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`ALTER TABLE column_configs ADD COLUMN instructions TEXT`);
      await db.runAsync(`ALTER TABLE column_configs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
      await db.runAsync(`ALTER TABLE inspection_products ADD COLUMN production_status REAL`);
      await db.runAsync(`ALTER TABLE inspection_products ADD COLUMN packing_status REAL`);
      await db.execAsync(`PRAGMA user_version = 3`);
    });
  } else if (version === 3) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`ALTER TABLE inspections ADD COLUMN invoice_no TEXT`);
      await db.runAsync(`ALTER TABLE inspection_results ADD COLUMN sample_size TEXT`);
      await db.runAsync(`CREATE TABLE IF NOT EXISTS global_inspection_points (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        is_numeric INTEGER NOT NULL DEFAULT 0,
        tolerance_type TEXT,
        tolerance_value REAL,
        group_name TEXT,
        severity TEXT NOT NULL DEFAULT 'medium',
        instructions TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`);
      await db.execAsync(`PRAGMA user_version = 4`);
    });
  } else if (version === 4) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`ALTER TABLE inspection_results ADD COLUMN video_uris TEXT NOT NULL DEFAULT '[]'`);
      await db.execAsync(`PRAGMA user_version = 5`);
    });
  } else if (version === 5) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(`ALTER TABLE inspections ADD COLUMN inspector_name TEXT`);
      await db.runAsync(`ALTER TABLE inspections ADD COLUMN report_type TEXT NOT NULL DEFAULT 'normal'`);
      await db.execAsync(`PRAGMA user_version = 6`);
    });
  }
}
