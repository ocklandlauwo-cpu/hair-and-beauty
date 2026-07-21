# Admin Sidebar Restructure — Settings / Report / Product Cycle Menus

## Purpose
Reorganize the admin role's sidebar navigation into three collapsible
parent menus — **Settings**, **Report**, **Product Cycle** — to reduce
top-level clutter as the admin nav has grown. This is admin-only: no other
role's sidebar changes.

## Scope decisions
- **Admin only.** store_keeper and seller sidebars are completely
  unchanged — they keep flat top-level access to whatever they can see
  today (Products, Purchases, Distributions, Clients, Sales, Attendance,
  P&L Report, as applicable per role). Only the *admin* role's entries for
  these same routes move into groups; admin's `roles` array is simply
  removed from the flat version of each moved route and a new grouped
  entry (scoped `roles: ['admin']`) is added instead.
- **No routes change.** This is sidebar/navigation-only — every path stays
  exactly as it is (`/products`, `/purchases`, `/sales`, etc.). No backend
  changes, no `router.tsx` changes, no risk to bookmarked URLs.
- **AI - Report becomes a true nested sub-menu** inside Report (Report →
  AI - Report → Slow Products / Fastest Products / Top Client Spend) —
  matching the literal request ("Move ... AI-Report as Sub-menu of Report
  Menu"). Today's `Sidebar.tsx` only supports one level of
  group-of-flat-links nesting; this requires extending the type/rendering
  to support a group whose child is itself a group (2 levels deep).
- **Items NOT mentioned in the request stay flat, top-level, for admin,
  unchanged**: Dashboard, Stock, Reconciliation, Expenses.

## Final admin navigation tree
```
Dashboard
Stock
Reconciliation
Expenses
Product Cycle ▾
  Purchases
  Distributions
  Sales
Settings ▾
  Users
  Products
  Categories
  Clients
  News
  Attendance
Report ▾
  Graphical View
  P&L Report
  AI - Report ▾
    Slow Products
    Fastest Products
    Top Client Spend
```

## Frontend

### `frontend/src/components/layout/Sidebar.tsx` (rewrite)

**Type changes** — extend the nav model to support a group whose children
can themselves be a nested group (needed only for AI - Report inside
Report; Settings and Product Cycle stay one level deep, using the same
shape for consistency):

```ts
interface FlatLink {
  kind: 'link'
  to: string
  label: string
  icon: LucideIcon
}

interface NavGroupChild extends Omit<NavGroup, 'roles'> {
  // a group nested inside another group has no independent role gate —
  // visibility is inherited from the top-level ancestor
}

type NavChild = FlatLink | NavGroupChild

interface NavGroup {
  kind: 'group'
  label: string
  icon: LucideIcon
  roles: readonly Role[]
  children: NavChild[]
}

type TopLevelEntry = (FlatLink & { roles: readonly Role[] }) | NavGroup
```

(Exact TypeScript shape to be finalized in the implementation plan — the
principle is: top-level entries carry `roles`, nested children do not,
and a `NavChild` can recursively be another group.)

**Rendering** — extract the existing inline group-rendering block into a
recursive `<NavGroupEntry entry={group} depth={0} activePath={pathname}
openGroups={openGroups} onToggle={toggleGroup} onNavigate={onClose} />`
component, so it can render a `NavGroup` whose `children` include another
`NavGroup` without duplicating the collapse/expand/active-state logic.
Indentation increases per depth (`ml-5` at depth 1, one more step at depth
2) so the nested AI - Report menu reads as visually deeper than its Report
parent.

**Auto-expand on active route** — the existing `openGroups` initializer
(which opens a group if the current path matches one of its children) must
become recursive: if the active path matches a route anywhere in a group's
descendant tree (including inside a nested group), both that group AND
its ancestor group auto-open. `openGroups` stays a flat `Set<string>`
keyed by label (all labels across all levels are unique: "Product Cycle",
"Settings", "Report", "AI - Report" — no collision risk).

**Entry data** — the full `allEntries` array, showing exactly which
existing flat entries lose the `'admin'` role (kept flat for
store_keeper/seller only) and which become admin-only group children:

| Route | Today | After (admin) | After (store_keeper / seller) |
|---|---|---|---|
| `/` Dashboard | all 3 | flat, unchanged | flat, unchanged |
| `/stock` | all 3 | flat, unchanged | flat, unchanged |
| `/reconciliations` | all 3 | flat, unchanged | flat, unchanged |
| `/expenses` | admin | flat, unchanged | (no access, unchanged) |
| `/purchases` | admin, store_keeper | **Product Cycle** child | flat (store_keeper only) |
| `/distributions` | all 3 | **Product Cycle** child | flat (store_keeper, seller) |
| `/sales` | all 3 | **Product Cycle** child | flat (store_keeper, seller) |
| `/users` | admin | **Settings** child | (no access, unchanged) |
| `/products` | all 3 | **Settings** child | flat (store_keeper, seller) |
| `/categories` | admin | **Settings** child | (no access, unchanged) |
| `/clients` | all 3 | **Settings** child | flat (store_keeper, seller) |
| `/news` | admin | **Settings** child | (no access, unchanged) |
| `/attendance` | all 3 | **Settings** child | flat (store_keeper, seller) |
| `/graphical-view` | admin | **Report** child | (no access, unchanged) |
| `/reports/pnl` | admin, store_keeper | **Report** child | flat (store_keeper only) |
| `/ai-reports/*` (3 routes) | admin (own group) | **Report → AI - Report** nested children | (no access, unchanged) |

**New icons needed** (all standard, widely-available lucide-react icons):
- `Settings` (gear) for the Settings group.
- `RefreshCw` for the Product Cycle group (suggests a cycle/flow).
- `FileBarChart` for the Report group (distinct from `BarChart2`, already
  used by the Graphical View child, avoiding a repeated icon at two
  adjacent levels).

All other icons (`CreditCard`, `Truck`, `ShoppingCart`, `Users`,
`Package`, `Tag`, `UserRound`, `FileText`, `Clock`, `BarChart2`,
`TrendingUp`, `BrainCircuit`, `TrendingDown`, `Zap`, `Trophy`,
`ChevronDown`) are already imported and reused as child icons exactly as
today.

## Testing
No dedicated `Sidebar.test.tsx` exists today. Given this is a pure
navigation/rendering change with no new business logic, verification is:
`tsc --noEmit` + production build (catches type errors and broken JSX),
plus a manual smoke test per role (admin sees the 3 new grouped menus with
correct children and working nested expand/collapse; store_keeper and
seller see their sidebars completely unchanged from today).

## Out of scope
- No changes to any route, controller, or page component — purely
  navigation/sidebar.
- No changes to store_keeper or seller navigation.
- No new "Settings" landing page — the Settings entry is a pure
  collapsible group, not a link itself (clicking it only expands/collapses
  its children, matching how the existing AI - Report group already
  behaves — it has no `to` of its own).

## Deployment
Commit, push to `develop`, verify Railway deploy picks it up
automatically. No new env vars or migrations — this is a static frontend
asset change.
