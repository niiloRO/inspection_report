@AGENTS.md

# Project: Factory Inspection App

A mobile-first quality inspection app for Android, built with Expo v55 + React Native + TypeScript.
Inspectors visit production sites, log results against product reference data, attach photos, and export PDF reports.

---

## Tech Stack

- **Expo SDK 55** — always use `npx expo install` for native packages, never plain `npm install`
- **expo-router v4** — file-based routing with typed routes enabled (`typedRoutes: true`)
- **expo-sqlite v15** — local database only, fully offline, no cloud sync
- **expo-file-system v17** — new API: use `File`, `Directory`, `Paths` classes (NOT the deprecated `readAsStringAsync` etc.)
- **React Compiler enabled** — do NOT add manual `useMemo`/`useCallback` unless profiling shows need
- **TypeScript strict mode**

---

## Project Structure

```
src/
  app/
    _layout.tsx              Stack root (wraps everything)
    index.tsx                Redirect → /(tabs)/
    settings.tsx             Redirect → /(tabs)/settings
    (tabs)/
      _layout.tsx            NativeTabs (tab bar UI)
      index.tsx              Inspections list screen
      settings.tsx           Settings screen
    inspection/
      _layout.tsx            Stack for inspection screens
      new.tsx                Product selection + batch info
      [id]/
        _layout.tsx          Stack for per-inspection screens
        template.tsx         Inspection form (SectionList)
        review.tsx           Review + complete
        report.tsx           PDF generation + sharing
  components/
    inspection/
      attribute-row.tsx      Numeric attribute input row
      inspection-point-row.tsx  Pass/fail toggle + note + photo
      severity-badge.tsx     Critical/Major/Minor colored pill
      photo-thumbnail.tsx    Tappable photo preview with full-screen modal
    app-tabs.tsx             NativeTabs triggers (Inspections + Settings)
    themed-text.tsx          Theme-aware Text
    themed-view.tsx          Theme-aware View
  constants/
    theme.ts                 Colors, Fonts, Spacing, SeverityColors
  db/
    index.tsx                DatabaseProvider + re-exports useSQLiteContext
    schema.ts                SQL DDL (all CREATE TABLE statements)
    migrations.ts            PRAGMA user_version migration runner
  hooks/
    use-inspections.ts       CRUD for inspections + results
    use-products.ts          Product search + inspection point lookup
    use-settings.ts          Column configs, severity, spreadsheet import
  services/
    excel-import.ts          SheetJS (.xlsx) parser
    pdf-generator.ts         HTML → PDF via expo-print + expo-sharing
    photo-service.ts         Camera capture + file management
  types/
    index.ts                 All shared TypeScript interfaces
```

---

## Navigation Rules

- Root layout is a **Stack** — inspection screens push on top of tabs (tab bar hides)
- Tabs live in `(tabs)/` group — NativeTabs trigger names must match filenames: `"index"` and `"settings"`
- Non-tab navigation: always `router.push('/inspection/new')` or `router.push({ pathname: '/inspection/[id]/template', params: { id } })`
- When navigating into tabs from outside: use `/(tabs)/` paths with `as any` cast (typed routes not yet aware of group)

---

## Database

SQLite file: `inspection.db` — single local database, no sync.

**Tables:** `products`, `column_configs`, `inspection_point_configs`, `product_inspection_points`, `inspections`, `inspection_products`, `inspection_results`, `app_meta`

- Products are imported from Excel; never manually inserted
- `inspection_results` uses `ON CONFLICT ... DO UPDATE` upsert — safe to call repeatedly
- Delete inspections by explicitly deleting from `inspection_results`, `inspection_products`, then `inspections` (do not rely on FK cascade)

---

## Data Flow: Excel Import

1. User picks `.xlsx` in Settings → `expo-document-picker` (always `copyToCacheDirectory: true` for Android `file://` URI)
2. `importSpreadsheet(uri)` → `new File(uri).base64()` → SheetJS parses in `setTimeout` to avoid JS thread block
3. Sheet 1 ("Product info"): column 0 = product ID, column 2 = name, columns 1–N = attributes
4. Sheet 2 ("Inspection points"): column 0 = product ID, columns 2–61 = inspection point texts; **products can span multiple rows** — use a global index counter per product ID
5. DB transaction: delete + re-insert products and inspection points; upsert column_configs and inspection_point_configs (preserves user settings)

---

## Inspection Flow

1. `new.tsx` — select products, enter units + batch size → `createInspection()` → push to `template`
2. `template.tsx` — `SectionList` with per-product sections (attribute rows + inspection point rows); auto-saves every change via `upsertResult()` with 400ms debounce on text fields, immediate on toggles
3. `review.tsx` — summary + failures sorted by severity; "Complete" → `completeInspection()` → push to `report`
4. `report.tsx` — calls `generateProductReport()` per product; photos embedded as base64 in HTML; share via `expo-sharing`

---

## File System (expo-file-system v17 API)

```typescript
// Read file as base64
await new File(uri).base64()

// Create directory (idempotent)
new Directory(uri).create({ intermediates: true, idempotent: true })

// Copy file
new File(sourceUri).copy(new File(destUri))

// Delete directory
new Directory(uri).delete()

// Get document directory path
Paths.document.uri   // e.g. "file:///data/.../documents/"
```

---

## Severity System

- **Critical** → `#c0392b` (red)
- **Major** → `#e67e22` (orange)
- **Minor** → `#f39c12` (yellow)
- Assigned per inspection point text in Settings → `inspection_point_configs` table
- PDF reports group failures by severity (critical first)

---

## PDF Reports

- One PDF per product even if multiple products were inspected together
- Uses `expo-print` (`printToFileAsync`) → HTML string with inline CSS only
- Photos embedded as `data:image/jpeg;base64,...` — referenced inline as "Photo N"
- Copy PDF from cache to `Paths.document.uri + 'reports/'` for persistence
- Share via `Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' })`

---

## GitHub Workflow

**Commit and push after every meaningful change session:**

```bash
git add -p                          # review and stage changes
git commit -m "short description"
git push origin master
```

**Suggested commit points:**
- After fixing a bug (commit immediately with a descriptive message)
- After completing a screen or feature
- Before starting a large refactor
- At the end of every working session, even if incomplete (use `wip:` prefix)

**Branch strategy (if features get large):**
```bash
git checkout -b feature/pdf-improvements
# work...
git push origin feature/pdf-improvements
# merge via PR or direct merge to master when done
```

**Never push directly without testing on device first** — a broken master means the app can't be demoed.

---

## Key Gotchas

1. `expo-file-system` v17 deprecated all old functions — they throw at runtime. Use `File`/`Directory`/`Paths` only.
2. `NativeTabs` requires a parent `Stack` to support `router.push` to non-tab screens.
3. Inspection points in Sheet 2 can span multiple rows for the same product — reset point index per product globally, not per row.
4. `PRAGMA foreign_keys = ON` must be set per connection — do not rely on it; delete related rows explicitly.
5. `expo-document-picker` on Android: always `copyToCacheDirectory: true` or you get a `content://` URI that SheetJS cannot read.
6. React Compiler is on — wrapping in `useCallback` without profiling evidence will conflict with compiler optimizations.
