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
- **expo-image-manipulator v13** — used to resize photos before PDF embedding (see Gotcha #21)
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
      settings.tsx           Settings screen (product info columns, groups, global inspection points, settings file import/export)
    inspection/
      _layout.tsx            Stack for inspection screens
      new.tsx                Product selection + batch info (units, batch, prod %, pack %, supplier, location, invoice NO, inspector name, report type)
      [id]/
        _layout.tsx          Stack for per-inspection screens
        template.tsx         Inspection form (SectionList, collapsible products + groups + GIPs)
        review.tsx           Review + complete
        report.tsx           PDF generation + sharing (PDF or ZIP) + re-generate + edit
  components/
    inspection/
      attribute-row.tsx      Dual-mode row: numeric input OR pass/fail toggle; sample size + note + photo + video + instructions modal
      inspection-point-row.tsx  Pass/fail toggle (deselectable) + sample size + note + photo + video
      severity-badge.tsx     High/Medium/Low colored pill
      photo-thumbnail.tsx    Tappable photo preview with full-screen modal
    app-tabs.tsx             NativeTabs triggers (Inspections + Settings)
    themed-text.tsx          Theme-aware Text
    themed-view.tsx          Theme-aware View
  constants/
    theme.ts                 Colors, Fonts, Spacing, SeverityColors
  db/
    index.tsx                DatabaseProvider + re-exports useSQLiteContext
    schema.ts                SQL DDL (all CREATE TABLE statements)
    migrations.ts            PRAGMA user_version migration runner (current version: 6)
  hooks/
    use-inspections.ts       CRUD for inspections + results; includes deleteResult()
    use-products.ts          Product search + inspection point lookup
    use-settings.ts          Column configs, groups, global inspection points, settings import/export
  services/
    excel-import.ts          SheetJS (.xlsx) parser — assigns sortOrder per column
    settings-export.ts       Export/import settings as .xlsx (Column Settings + Groups + Global inspection points sheets)
    pdf-generator.ts         HTML → PDF via expo-print + expo-sharing; exports generateProductReport + generateNestedReport
    photo-service.ts         Camera capture + file management
    video-service.ts         Video recording via expo-image-picker; saves to inspections/{id}/ directory
  types/
    index.ts                 All shared TypeScript interfaces
```

---

## Navigation Rules

- Root layout is a **Stack** — inspection screens push on top of tabs (tab bar hides)
- Tabs live in `(tabs)/` group — NativeTabs trigger names must match filenames: `"index"` and `"settings"`
- Non-tab navigation: always `router.push('/inspection/new')` or `router.push({ pathname: '/inspection/[id]/template', params: { id } })`
- When navigating into tabs from outside: use `/(tabs)/` paths with `as any` cast (typed routes not yet aware of group)
- **Home button (⌂)** is present on every non-tab screen header — navigates via `router.replace('/(tabs)/' as any)`; always add one when creating new inspection screens

---

## Database

SQLite file: `inspection.db` — single local database, no sync. **Current schema version: 6.**

**Tables:** `products`, `column_configs`, `inspection_point_configs`, `product_inspection_points`, `inspections`, `inspection_products`, `inspection_results`, `app_meta`, `groups`, `global_inspection_points`

### Key column_configs fields
| Column | Purpose |
|--------|---------|
| `key` | Generated from label (snake_case) |
| `label` | Display name |
| `visible` | Show/hide in template |
| `is_numeric` | 0 = text/pass-fail mode, 1 = numeric input mode |
| `tolerance_type` / `tolerance_value` | Only applies when is_numeric=1 |
| `severity` | high/medium/low — used for failure grouping in PDF |
| `group_name` | Optional group for sub-sectioning |
| `sort_order` | Spreadsheet column order (preserved across imports) |
| `instructions` | Optional measurement instructions shown as "?" popup in template |

### Key global_inspection_points fields
Same schema as `column_configs` (key, label, visible, is_numeric, tolerance_type, tolerance_value, group_name, severity, instructions, sort_order). These are permanent inspection points that appear for every product. Managed in Settings under "Global Inspection Points".

### Key inspection_products fields
| Column | Purpose |
|--------|---------|
| `units_inspected` / `batch_size` | Per-product quantities |
| `production_status` | Optional 0–100 percentage (nullable REAL) |
| `packing_status` | Optional 0–100 percentage (nullable REAL) |

### Key inspections fields
| Column | Purpose |
|--------|---------|
| `invoice_no` | Optional invoice number entered when starting inspection (added v4) |
| `inspector_name` | Optional inspector name entered when starting inspection (added v6) |
| `report_type` | `'normal'` (one PDF per product) or `'nested'` (one combined PDF, added v6) |

### Key inspection_results fields
| Column | Purpose |
|--------|---------|
| `sample_size` | Optional free-text sample size entered per result row (added v4) |
| `type` | `'attribute'`, `'inspection_point'`, or `'global_inspection_point'` |
| `video_uris` | JSON array of local video file URIs (added v5) |

### point_key prefix conventions
| Type | point_key format | Source table |
|------|-----------------|--------------|
| `attribute` | `attr:{colKey}` | `column_configs` |
| `inspection_point` | `ip:{pointIndex}` | `product_inspection_points` |
| `global_inspection_point` | `gip:{key}` | `global_inspection_points` |

- Products are imported from Excel; never manually inserted
- `inspection_results` uses `ON CONFLICT ... DO UPDATE` upsert — safe to call repeatedly
- Delete inspections by explicitly deleting from `inspection_results`, `inspection_products`, then `inspections` (do not rely on FK cascade)
- `deleteResult(inspectionId, productId, pointKey)` removes a single result row — used when user deselects pass/fail back to N/A

---

## Data Flow: Excel Import (Product Data)

1. User picks `.xlsx` in Settings → `expo-document-picker` (always `copyToCacheDirectory: true` for Android `file://` URI)
2. `importSpreadsheet(uri)` → `new File(uri).base64()` → SheetJS parses in `setTimeout` to avoid JS thread block
3. Sheet 1 ("Product info"): column 0 = product ID, column 2 = name, columns 1–N = attributes
4. Sheet 2 ("Inspection points"): column 0 = product ID, columns 2–61 = inspection point texts; **products can span multiple rows** — use a global index counter per product ID
5. DB transaction: delete + re-insert products and inspection points; upsert column_configs (preserves user settings for visibility, tolerance, severity, group, instructions — updates label and sort_order)
6. `sort_order` is set to the column's index in the spreadsheet (colIdx − 1); columns display in this order in Settings and the template

---

## Settings Export/Import

Handled by `src/services/settings-export.ts`. Uses SheetJS to read/write a 4-sheet `.xlsx` file:

| Sheet | Columns | Purpose |
|-------|---------|---------|
| `Column Settings` | Key, Label, Enabled, Type, Criticality, Group, Tolerance Type, Tolerance Value, Instructions | Product info column configuration |
| `Groups` | Group Name | Named groups in sort order |
| `Global inspection points` | Same columns as Column Settings | Global inspection point configuration |
| `Instructions` | Column, Description, Accepted Values | Human-readable guide to every field in the settings file |

- **Export**: shares the file via `expo-sharing` — call `exportSettings(columnConfigs, groups, globalInspectionPoints)`
- **Import**: `parseSettingsFile(uri)` → `importSettings(fileUri)` in `use-settings.ts` applies settings in a transaction (update columns → rebuild groups → re-attach group assignments → replace global inspection points)
- Export enabled when either column configs or global inspection points exist
- Import of "Global inspection points" sheet is additive-replace: existing GIPs are deleted and replaced with sheet contents

---

## Inspection Flow

0. `(tabs)/index.tsx` — Inspections list; each card shows a title line (`Supplier · InvoiceNo · ProductIDs`) above the product count/date line, built by `buildInspectionTitle(item)`
1. `new.tsx` — select products, enter optional global fields (supplier, location, invoice NO, inspector name) + per-product units/batch/production%/packing%; when 2+ products selected shows **Normal / Nested** report type toggle → `createInspection()` → `router.replace` to `template`
2. `template.tsx` — `SectionList` wrapped in `KeyboardAvoidingView`; per-product sections (collapsible via header chevron); attributes sub-grouped by named group (mixed with GIPs), then ungrouped "Global Inspection Points" sub-section, then "Inspection Points" sub-section; all sub-headers collapsible; auto-saves via `upsertResult()` with 400ms debounce on text, immediate on toggles; `flushPendingSaves()` called before Back/Home/Review navigation; deselecting pass/fail calls `deleteResult()` to restore N/A; each row supports photo + video capture
3. `review.tsx` — summary + failures sorted by severity (attribute + GIP failures by severity, inspection points sorted last); "Complete" → `completeInspection()` → `router.replace` to `report`
4. `report.tsx` — for **Normal** type: calls `generateProductReport()` per product with per-product tabs; for **Nested** type: calls `generateNestedReport()` once for all products combined; inspector name printed in all PDFs; photos section always starts on a new page; "↺ Regenerate PDF" and "✏ Edit" buttons in footer; videos are bundled with PDF in a ZIP via jszip when present; share via `expo-sharing`

---

## File System (expo-file-system v17 API)

```typescript
// Read file as base64
await new File(uri).base64()

// Create directory (idempotent)
new Directory(uri).create({ intermediates: true, idempotent: true })

// Copy file — ALWAYS delete destination first if it may already exist
if (destFile.exists) destFile.delete();
new File(sourceUri).copy(new File(destUri))

// Delete directory
new Directory(uri).delete()

// Get document directory path
Paths.document.uri   // e.g. "file:///data/.../documents/"
```

---

## Severity System

- **High** → `#c0392b` (red)
- **Medium** → `#e67e22` (orange)
- **Low** → `#f39c12` (yellow)
- Assigned per **Product info column** in Settings → `column_configs` table (`severity` field)
- Also assigned per **Global inspection point** in Settings → `global_inspection_points` table (`severity` field)
- **Inspection points do NOT have severity** — they are shown without a severity badge in the template, review screen, and PDF
- PDF reports: "Failures by Criticality" summary table (High/Medium/Low counts combining attribute + GIP failures, + Inspection Points count), then detailed failure list grouped by severity

---

## Pass/Fail & N/A Logic

- **N/A** is the default state for all inspection points and pass/fail-type Product info columns — shown when no result row exists in DB
- **PASS** is recorded when: user toggles PASS, or a numeric value is entered within tolerance
- **FAIL** is recorded when: user toggles FAIL, or a numeric value is entered outside tolerance
- Deselecting (tapping the active PASS or FAIL button again) restores N/A by deleting the result row from DB
- Numeric columns with no value entered (empty field) → N/A in PDF even if a row exists
- In `template.tsx`, the default `ResultEntry` has `passed: null` — never defaults to PASS or FAIL

---

## Product Info Columns — Two Modes

Controlled by `is_numeric` in `column_configs` (same applies to `global_inspection_points`):

| Mode | `is_numeric` | Template UI | Tolerance applies? |
|------|-------------|-------------|-------------------|
| Numeric | 1 | Number input + computed pass/fail indicator | Yes |
| Text / Pass-Fail | 0 | Pass/Fail toggle buttons (deselectable) | No |

Toggle changed in Settings per column. Switching to Text clears any existing tolerance.

### Tolerance Types

Four tolerance types for numeric columns:

| Type | Pass condition | `tolerance.value` |
|------|---------------|-------------------|
| `absolute` | `|measured − ref| ≤ value` | required (`number`) |
| `percent` | `|measured − ref| / |ref| × 100 ≤ value` | required (`number`) |
| `min` | `measured ≥ bound` | `number` or `null` |
| `max` | `measured ≤ bound` | `number` or `null` |

For `min` and `max`, `tolerance.value` may be `null` — this means "use the product's reference value as the bound". The placeholder in Settings shows `"use ref value"` when empty. For `absolute`/`percent`, a value is always required.

The DB stores `null` in `tolerance_value` for min/max with no explicit bound — this is valid and intentional. All 6 inline tolerance loaders (use-settings.ts ×2, report.tsx ×2, template.tsx ×2) must use the IIFE pattern that preserves `null` for min/max (see Gotcha #18).

---

## Global Inspection Points

Permanent inspection points that apply to **every product** in every inspection. Managed in Settings under "Global Inspection Points" section (always visible, below product info and groups).

- Same configuration options as product info columns: enable/disable, numeric/text, criticality, groups, tolerance, instructions
- **Grouping**: if assigned a `group_name` matching a named group, the GIP merges into that group section alongside product info attributes in the template and PDF. Ungrouped GIPs appear under a dedicated "Global Inspection Points" collapsible sub-header.
- **point_key**: `gip:{key}` — stored in `inspection_results` with `type = 'global_inspection_point'`
- **No reference value** — GIP rows in the PDF show "—" in the Reference column
- Failures count in the High/Medium/Low criticality rows based on their assigned severity

---

## Sample Size

- A "Sample size" input (numeric keyboard, always labeled) appears on every result row in the template
- **Pre-populated** from the product's `units_inspected` value entered in the New Inspection screen — the label stays visible so it's never confused with an attribute input
- The pre-populated default is only written to DB when the user changes something else on that row; leaving a row entirely untouched preserves N/A (see Gotcha #12)
- Stored as `inspection_results.sample_size` (TEXT, nullable)
- Displayed in the PDF as a "Sample Size" column between Attribute and Reference (attribute table) or between Inspection Point and Result (inspection points table)

---

## Instructions (Product Info & Global Inspection Points)

- Optional free-text stored in `column_configs.instructions` / `global_inspection_points.instructions`
- Edited in Settings under each column/GIP
- In the inspection template, columns with instructions show a blue "?" button next to the label
- Tapping "?" opens a `Modal` overlay with the instruction text and an "×" close button
- Instructions are hidden (along with all other settings) when a column is disabled in Settings

---

## PDF Reports

Two modes controlled by `inspections.report_type`:

### Normal (per-product)
- One PDF per product; multiple products show per-product tabs on the report screen
- PDF saved to `Paths.document.uri + 'reports/{Supplier}_{InvoiceNo}_{ProductID}.pdf'`

### Nested (combined, multi-product)
- Single PDF for all products combined; saved to `Paths.document.uri + 'reports/{Supplier}_{InvoiceNo}_{ProductID1}-{ProductID2}.pdf'`
- Attribute/GIP table uses `rowspan` on the attribute cell so each attribute row spans all N product sub-rows
- Inspection points section lists per-product groups with a blue sub-header per product
- Header shows: date, inspector, supplier, location, invoice NO; Products table; per-product summary stats

### Common to both
- PDF filename built by `buildReportFilename(supplier, invoiceNo, productIds[])` in `pdf-generator.ts` — falls back to `NoSupplier`/`NoInvoice`/`NoProduct`; special characters stripped, spaces → underscores
- Uses `expo-print` (`printToFileAsync`) → HTML string with inline CSS only
- Header includes: inspector name (if set), supplier, location, invoice NO, production %, packing % (when set)
- Stats: Passed / Failed / Total Filled
- **Failures by Criticality** summary table: High N, Medium N, Low N (attributes + GIPs combined), Inspection Points N
- Detailed failures list: attribute + GIP failures grouped by severity, then inspection point failures flat
- **Product Attribute Results** table (7 columns): Attribute | Sample Size | Reference | Measured | Result | Note | **Media** — includes both product info columns and global inspection points (GIPs grouped by group_name; ungrouped GIPs under "Global Inspection Points" sub-header)
- **Inspection Points** table (5 columns): Inspection Point | Sample Size | Result | Note | **Media**
- The **Media** column combines photo anchor links (`Photo 1, Photo 2`) and plain-text video labels (`Video 1`) for every result row — all photos are linked, not just the first
- Data rows alternate between white and `#f3f3f3` (light grey) for readability — row index is tracked across group boundaries
- Group sub-headers use `background:#d0e4f8; color:#1a5fa8` (blue-tinted) to clearly separate them from alternating data rows; `<th>` column headers use `#d0d0d0` mid-grey
- Photos are **resized to 1200 px wide, 70 % JPEG quality** via `expo-image-manipulator` before base64 encoding — prevents Android OOM during `printToFileAsync` (see Gotcha #21)
- Photos printed **4-per-page** in a flex-column layout (`<div class="photo-page">`), grouped into `.photo-row` pairs; `height: calc(100vh - 48px)` with `min-height: 0` on all flex children ensures no spillover; "Attached Photos" heading is placed **inside** the first `.photo-page` div as a `flex: 0 0 auto` item
- **Photos section always starts on a new page** via `page-break-before: always` on the wrapping div; `page-break-after: always` on each `.photo-page`
- `Photo N` references in all tables are `<a href="#photo-N">` anchor links; each photo block has `id="photo-N"` — PDF viewers jump to the correct page
- "↺ Regenerate PDF" and "✏ Edit" buttons in footer; Edit navigates back to `template.tsx` regardless of status
- If videos were recorded, share bundles PDF + videos in a ZIP via `jszip` (pure JS — no native module needed); otherwise shares PDF directly

---

## Videos

- A 🎥 button on every result row in the template triggers `recordVideo()` from `video-service.ts`
- Videos are saved to `Paths.document.uri + 'inspections/{inspectionId}/'` (same directory as photos)
- Stored as `inspection_results.video_uris` (JSON array of local URIs)
- Videos are **not embedded in the PDF** — they are bundled with the PDF into a ZIP when sharing
- ZIP is generated with `jszip` (pure JS library) — do NOT use `react-native-zip-archive` (native module, not in dev build)
- **ZIP naming**: the PDF inside the ZIP is named identically to the ZIP file (e.g. `Supplier_INV_PROD.pdf`); videos are named `video_1_Supplier_INV_PROD.mp4`, `video_2_Supplier_INV_PROD.mp4`, etc. — `baseName` is derived from the PDF URI in `shareBundle()`
- `shareBundle()` writes the ZIP using `FileHandle.writeBytes()` (not `File.write()`) — Android's `FileChannel.write()` does not guarantee a full write for large buffers; `FileHandle` loops until all bytes are written (see Gotcha #25)
- `File.bytes()` reads a file as `Uint8Array` — used for reading photos/videos into jszip
- Video chips appear below photo thumbnails in the template row; tapping "×" removes a video

---

## Template UI: Collapse/Expand

- **All sections collapsed by default** — `collapsedProducts` and `collapsedGroups` are populated at the end of `load()` from the built sections; do not initialise them as empty sets
- **Product sections**: tap the product name header (▼/▶ chevron) to collapse/expand all items for that product
- **Group sub-headers**: tap any group sub-header (▼/▶ chevron) to collapse/expand items in that group
- "Global Inspection Points" sub-header is collapsible like named groups (only shown when ungrouped GIPs exist)
- "Inspection Points" sub-header is collapsible (only shown when the product has inspection points)
- Collapsed state is in-memory only (resets on screen reload)

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
2. `File.copy()` throws if the destination already exists — always `if (destFile.exists) destFile.delete()` before copying.
3. `NativeTabs` requires a parent `Stack` to support `router.push` to non-tab screens.
4. Inspection points in Sheet 2 can span multiple rows for the same product — reset point index per product globally, not per row.
5. `PRAGMA foreign_keys = ON` must be set per connection — do not rely on it; delete related rows explicitly.
6. `expo-document-picker` on Android: always `copyToCacheDirectory: true` or you get a `content://` URI that SheetJS cannot read.
7. React Compiler is on — wrapping in `useCallback` without profiling evidence will conflict with compiler optimizations.
8. `column_configs` sort order is set during Excel import; it is preserved on re-import (upsert updates `sort_order`). Do not use `ORDER BY label` anywhere — always `ORDER BY sort_order`.
9. When a pass/fail toggle is deselected (returns to null), call `deleteResult()` rather than upserting with `passed=null` — the absence of a DB row is the N/A signal.
10. Inspection point severity is intentionally not shown anywhere in the UI or PDF — do not re-introduce severity display for inspection points.
11. `point_key` prefixes are load-bearing: `attr:` for product info columns, `gip:` for global inspection points, `ip:` for inspection points. Never mix them up or strip prefixes when storing.
12. `scheduleSave()` in `template.tsx` treats a sample size equal to the per-product default (from `units_inspected`) as non-input for the isEmpty check — so deselecting pass/fail on a row with only the default sample size correctly restores N/A. Only an *explicitly modified* sample size (different from the default) keeps the row filled.
13. Before navigating away from `template.tsx` (Back, Home, Review), always call `await flushPendingSaves()` — it cancels all debounce timers and immediately writes pending results to DB. Skipping this can silently drop the last 400ms of edits.
14. Android keyboard: `softwareKeyboardLayoutMode: "pan"` in `app.json` makes the view pan upward when the keyboard opens. The template also uses `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"` + `automaticallyAdjustKeyboardInsets` on the `SectionList`.
15. Do NOT use `react-native-zip-archive` — it requires a native module that isn't in the dev build and crashes on import. Use `jszip` (pure JS) instead: `zip.file(name, await new File(uri).bytes())`, then `zipFile.write(await zip.generateAsync({ type: 'uint8array' }))`.
16. For nested reports, inspection point pointKeys in `results` are translated from `ip:{index}` to the actual text string before being passed to `generateNestedReport` — the resultMap is therefore keyed by `{productId}:{pointText}` for inspection points.
17. The `report_type` column defaults to `'normal'` in the DB — existing inspections without this column (before migration v6) behave as normal reports. Always use `inspection.reportType ?? 'normal'` when reading it.
18. Min/Max tolerance with `null` value means "compare against the product reference value at inspection time." All 6 inline tolerance loaders must use the IIFE pattern: `if (type === 'min' || type === 'max') return { type, value: r.tolerance_value }` — passing `null` through. The earlier guard `r.tolerance_value != null` silently dropped these entries; do not reintroduce it for min/max.
19. PDF row shading uses a `rowIdx` counter that increments for every data row regardless of group boundaries — do not reset the counter per group or the alternating pattern breaks at group sub-headers. In nested reports, use a separate `nestedAttrIdx` counter in the outer closure of `nestedRows()` so the shade is consistent across all product sub-rows for the same attribute.
20. The PDF "Photo" column is now called **"Media"** and combines photo anchor links and plain-text video labels for every result row. All photos for a result are linked (not just the first). `photoNumberMap` is `Map<string, number[]>`. Do not revert to a single `number` map or a separate video column.
21. Photos must be resized before PDF embedding — `photoToBase64()` in `photo-service.ts` uses `expo-image-manipulator` to resize to 1200 px wide at 70 % JPEG quality. Removing this causes Android `OutOfMemoryError` during `printToFileAsync`. `largeHeap: true` in `app.json` raises the production heap cap to ~512 MB; this has no effect in dev/Expo Go builds.
22. Scroll restore in `template.tsx` after camera/video capture: (1) call `Keyboard.dismiss()` before opening the picker to prevent mid-layout conflicts when a keyboard is open in another row; (2) use `setTimeout(() => { ... }, 50)` — not `requestAnimationFrame` — to give the SectionList time to settle; (3) guard with `typeof list.scrollToOffset === 'function'` — optional chaining `?.` alone crashes under the React Compiler when the ref is in a transitional state.
23. `createInspection()` in `use-inspections.ts` stores the **sum** of all products' `unitsInspected` and `batchSize` in the `inspections` table row — this is the value shown in the inspections list. Per-product values are stored correctly in `inspection_products` and used by the PDF generator.
24. `canStart` in `new.tsx` validates units/batch with `parseInt(...) > 0` — this correctly rejects empty strings, zero, negatives, and non-numeric text (since `NaN > 0 === false`). Do not revert to a truthiness check (`!!u?.units`) which allows any non-empty string through.
25. `shareBundle()` in `report.tsx` writes the ZIP using `FileHandle.writeBytes()` (not `File.write(Uint8Array)`). On Android, `File.write()` calls `FileChannel.write()` once without a loop and can silently truncate large files (>4 MB). `FileHandle.writeBytes()` loops until all bytes are written and is safe for any size.
