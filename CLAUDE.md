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
      settings.tsx           Settings screen (product info columns, groups, global inspection points, settings file import/export)
    inspection/
      _layout.tsx            Stack for inspection screens
      new.tsx                Product selection + batch info (units, batch, prod %, pack %, supplier, location, invoice NO)
      [id]/
        _layout.tsx          Stack for per-inspection screens
        template.tsx         Inspection form (SectionList, collapsible products + groups + GIPs)
        review.tsx           Review + complete
        report.tsx           PDF generation + sharing + re-generate
  components/
    inspection/
      attribute-row.tsx      Dual-mode row: numeric input OR pass/fail toggle; sample size + note + photo + instructions modal
      inspection-point-row.tsx  Pass/fail toggle (deselectable) + sample size + note + photo
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
    migrations.ts            PRAGMA user_version migration runner (current version: 4)
  hooks/
    use-inspections.ts       CRUD for inspections + results; includes deleteResult()
    use-products.ts          Product search + inspection point lookup
    use-settings.ts          Column configs, groups, global inspection points, settings import/export
  services/
    excel-import.ts          SheetJS (.xlsx) parser — assigns sortOrder per column
    settings-export.ts       Export/import settings as .xlsx (Column Settings + Groups + Global inspection points sheets)
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
- **Home button (⌂)** is present on every non-tab screen header — navigates via `router.replace('/(tabs)/' as any)`; always add one when creating new inspection screens

---

## Database

SQLite file: `inspection.db` — single local database, no sync. **Current schema version: 4.**

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

### Key inspections fields (added in v4)
| Column | Purpose |
|--------|---------|
| `invoice_no` | Optional invoice number entered when starting inspection |

### Key inspection_results fields (added in v4)
| Column | Purpose |
|--------|---------|
| `sample_size` | Optional free-text sample size entered per result row |
| `type` | `'attribute'`, `'inspection_point'`, or `'global_inspection_point'` |

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

Handled by `src/services/settings-export.ts`. Uses SheetJS to read/write a 3-sheet `.xlsx` file:

| Sheet | Columns | Purpose |
|-------|---------|---------|
| `Column Settings` | Key, Label, Enabled, Type, Criticality, Group, Tolerance Type, Tolerance Value, Instructions | Product info column configuration |
| `Groups` | Group Name | Named groups in sort order |
| `Global inspection points` | Same columns as Column Settings | Global inspection point configuration |

- **Export**: shares the file via `expo-sharing` — call `exportSettings(columnConfigs, groups, globalInspectionPoints)`
- **Import**: `parseSettingsFile(uri)` → `importSettings(fileUri)` in `use-settings.ts` applies settings in a transaction (update columns → rebuild groups → re-attach group assignments → replace global inspection points)
- Export enabled when either column configs or global inspection points exist
- Import of "Global inspection points" sheet is additive-replace: existing GIPs are deleted and replaced with sheet contents

---

## Inspection Flow

1. `new.tsx` — select products, enter optional global fields (supplier, location, invoice NO) + per-product units/batch/production%/packing% → `createInspection()` → `router.replace` to `template`
2. `template.tsx` — `SectionList` wrapped in `KeyboardAvoidingView`; per-product sections (collapsible via header chevron); attributes sub-grouped by named group (mixed with GIPs), then ungrouped "Global Inspection Points" sub-section, then "Inspection Points" sub-section; all sub-headers collapsible; auto-saves via `upsertResult()` with 400ms debounce on text, immediate on toggles; `flushPendingSaves()` called before Back/Home/Review navigation; deselecting pass/fail calls `deleteResult()` to restore N/A
3. `review.tsx` — summary + failures sorted by severity (attribute + GIP failures by severity, inspection points sorted last); "Complete" → `completeInspection()` → `router.replace` to `report`
4. `report.tsx` — calls `generateProductReport()` per product; photos embedded as base64 in HTML; share via `expo-sharing`; "↺ Regenerate PDF" button available once a PDF has been generated

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

- One PDF per product even if multiple products were inspected together
- Uses `expo-print` (`printToFileAsync`) → HTML string with inline CSS only
- Header includes: product name, date, units inspected / batch size, supplier, location, invoice NO, production %, packing % (when set)
- Stats: Passed / Failed / Total Filled
- **Failures by Criticality** summary table: High N, Medium N, Low N (attributes + GIPs combined), Inspection Points N
- Detailed failures list: attribute + GIP failures grouped by severity, then inspection point failures flat
- **Product Attribute Results** table (7 columns): Attribute | Sample Size | Reference | Measured | Result | Note | Photo — includes both product info columns and global inspection points (GIPs grouped by group_name; ungrouped GIPs under "Global Inspection Points" sub-header)
- **Inspection Points** table (5 columns): Inspection Point | Sample Size | Result | Note | Photo
- Photos embedded as `data:image/jpeg;base64,...` — printed **4-per-page in a 2×2 CSS grid** (`<div class="photo-page">`), each page forced with `page-break-after: always`
- "Photo N" references in all tables are `<a href="#photo-N">` anchor links; each photo block has `id="photo-N"` — PDF viewers jump to the correct page
- PDF saved to `Paths.document.uri + 'reports/{productId}_{inspectionId}.pdf'` — destination deleted before copy to allow regeneration
- "↺ Regenerate PDF" secondary button appears once a PDF exists; tapping it clears the cached URI and re-generates
- Share via `Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' })`

---

## Template UI: Collapse/Expand

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
