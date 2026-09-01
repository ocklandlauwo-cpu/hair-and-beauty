import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Package, Boxes, Truck, ShoppingCart, CreditCard, FileText,
  Users, TrendingUp, ClipboardCheck, Clock, Receipt, UserRound, Tag, BarChart2,
  BrainCircuit, TrendingDown, ChevronDown, Trophy, Zap, Settings, RefreshCw,
  FileBarChart, Scissors,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface FlatLink {
  kind: 'link'
  to: string
  label: string
  icon: LucideIcon
}

interface NestedGroup {
  kind: 'group'
  label: string
  icon: LucideIcon
  children: NavChild[]
}

type NavChild = FlatLink | NestedGroup

type TopLevelEntry =
  | (FlatLink & { roles: readonly Role[] })
  | (NestedGroup & { roles: readonly Role[] })

const allEntries: TopLevelEntry[] = [
  { kind: 'link', to: '/',                label: 'Dashboard',      icon: LayoutDashboard, roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/stock',           label: 'Stock',          icon: Boxes,           roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/reconciliations', label: 'Reconciliation', icon: ClipboardCheck,  roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/saloon-center',   label: 'Saloon Center',  icon: Scissors,        roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/expenses',        label: 'Expenses',       icon: Receipt,         roles: ['admin'] },

  // Non-admin flat access to routes that move into admin-only groups below —
  // store_keeper/seller sidebars are unaffected by the admin restructure.
  { kind: 'link', to: '/products',       label: 'Products',       icon: Package,      roles: ['store_keeper', 'seller'] },
  { kind: 'link', to: '/purchases',      label: 'Purchases',      icon: CreditCard,   roles: ['store_keeper'] },
  { kind: 'link', to: '/distributions',  label: 'Distributions',  icon: Truck,        roles: ['store_keeper', 'seller'] },
  { kind: 'link', to: '/clients',        label: 'Clients',        icon: UserRound,    roles: ['store_keeper', 'seller'] },
  { kind: 'link', to: '/sales',          label: 'Sales',          icon: ShoppingCart, roles: ['store_keeper', 'seller'] },
  { kind: 'link', to: '/attendance',     label: 'Attendance',     icon: Clock,        roles: ['store_keeper', 'seller'] },
  { kind: 'link', to: '/reports/pnl',    label: 'P&L Report',     icon: TrendingUp,   roles: ['store_keeper'] },

  // Admin-only grouped menus
  {
    kind: 'group',
    label: 'Product Cycle',
    icon: RefreshCw,
    roles: ['admin'],
    children: [
      { kind: 'link', to: '/purchases',     label: 'Purchases',     icon: CreditCard },
      { kind: 'link', to: '/distributions', label: 'Distributions', icon: Truck },
      { kind: 'link', to: '/sales',         label: 'Sales',         icon: ShoppingCart },
    ],
  },
  {
    kind: 'group',
    label: 'Settings',
    icon: Settings,
    roles: ['admin'],
    children: [
      { kind: 'link', to: '/users',      label: 'Users',      icon: Users },
      { kind: 'link', to: '/products',   label: 'Products',   icon: Package },
      { kind: 'link', to: '/categories', label: 'Categories', icon: Tag },
      { kind: 'link', to: '/clients',          label: 'Clients',          icon: UserRound },
      { kind: 'link', to: '/providers',        label: 'Providers',        icon: UserRound },
      { kind: 'link', to: '/saloon-services',  label: 'Saloon Services',  icon: Scissors },
      { kind: 'link', to: '/saloon-tools',     label: 'Saloon Tools',     icon: Boxes },
      { kind: 'link', to: '/news',       label: 'News',       icon: FileText },
      { kind: 'link', to: '/attendance', label: 'Attendance', icon: Clock },
    ],
  },
  {
    kind: 'group',
    label: 'Report',
    icon: FileBarChart,
    roles: ['admin'],
    children: [
      { kind: 'link', to: '/graphical-view', label: 'Graphical View', icon: BarChart2 },
      { kind: 'link', to: '/reports/pnl',    label: 'P&L Report',     icon: TrendingUp },
      {
        kind: 'group',
        label: 'AI - Report',
        icon: BrainCircuit,
        children: [
          { kind: 'link', to: '/ai-reports/slow-products',    label: 'Slow Products',    icon: TrendingDown },
          { kind: 'link', to: '/ai-reports/fastest-products', label: 'Fastest Products', icon: Zap },
          { kind: 'link', to: '/ai-reports/top-clients',      label: 'Top Client Spend', icon: Trophy },
        ],
      },
    ],
  },
]

// ── Recursive helpers ────────────────────────────────────────────────────
function hasActiveDescendant(children: NavChild[], pathname: string): boolean {
  return children.some(child =>
    child.kind === 'link'
      ? pathname.startsWith(child.to)
      : hasActiveDescendant(child.children, pathname),
  )
}

/** Recursively collects the labels of every group (at any depth) that
 * contains the active route, so both a parent and its nested child group
 * auto-open together. Returns whether this subtree itself is active. */
function collectOpenGroups(children: NavChild[], pathname: string, acc: Set<string>): boolean {
  let anyActive = false
  for (const child of children) {
    if (child.kind === 'link') {
      if (pathname.startsWith(child.to)) anyActive = true
    } else {
      const childActive = collectOpenGroups(child.children, pathname, acc)
      if (childActive) {
        acc.add(child.label)
        anyActive = true
      }
    }
  }
  return anyActive
}

// ── Recursive nav node (renders a flat link or a group at any depth) ────
function NavNode({
  entry, depth, pathname, openGroups, onToggle, onNavigate,
}: {
  entry: NavChild
  depth: number
  pathname: string
  openGroups: Set<string>
  onToggle: (label: string) => void
  onNavigate: () => void
}) {
  if (entry.kind === 'link') {
    const Icon = entry.icon
    return (
      <NavLink
        to={entry.to}
        end={entry.to === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            depth === 0
              ? 'flex items-center gap-3 rounded-xl px-3 h-9 text-sm font-medium transition-colors'
              : 'flex items-center gap-2.5 rounded-lg px-3 h-8 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary-50 text-primary-700'
              : 'text-gray-500 hover:bg-warm-100 hover:text-gray-900',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={depth === 0 ? 16 : 14} aria-hidden="true" className={isActive ? 'text-primary-600' : 'text-gray-400'} />
            {entry.label}
          </>
        )}
      </NavLink>
    )
  }

  const GroupIcon = entry.icon
  const isGroupActive = hasActiveDescendant(entry.children, pathname)
  const isGroupOpen = openGroups.has(entry.label) || isGroupActive

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(entry.label)}
        className={cn(
          depth === 0
            ? 'flex w-full items-center gap-3 rounded-xl px-3 h-9 text-sm font-medium transition-colors'
            : 'flex w-full items-center gap-2.5 rounded-lg px-3 h-8 text-sm font-medium transition-colors',
          isGroupActive ? 'text-primary-700' : 'text-gray-500 hover:bg-warm-100 hover:text-gray-900',
        )}
      >
        <GroupIcon size={depth === 0 ? 16 : 14} aria-hidden="true" className={isGroupActive ? 'text-primary-600' : 'text-gray-400'} />
        <span className="flex-1 text-left">{entry.label}</span>
        <ChevronDown
          size={14}
          className={cn('text-gray-400 transition-transform duration-200', isGroupOpen && 'rotate-180')}
        />
      </button>

      {isGroupOpen && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
          {entry.children.map(child => (
            <NavNode
              key={child.kind === 'link' ? child.to : child.label}
              entry={child}
              depth={depth + 1}
              pathname={pathname}
              openGroups={openGroups}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth()
  const location = useLocation()
  const role: Role = user?.role ?? 'seller'

  const entries = allEntries.filter(e => (e.roles as readonly Role[]).includes(role))

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const e of allEntries) {
      if (e.kind === 'group') {
        const isActive = collectOpenGroups(e.children, location.pathname, initial)
        if (isActive) initial.add(e.label)
      }
    }
    return initial
  })

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-white border-r border-warm-200',
          'transition-transform duration-300 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2 px-6 border-b border-warm-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600">
            <span className="text-xs font-bold text-white">H&amp;B</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Hair &amp; Beauty</p>
            <p className="text-xs font-medium text-primary-600 leading-tight">Intelligence</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
          {entries.map(entry => (
            <NavNode
              key={entry.kind === 'link' ? entry.to : entry.label}
              entry={entry}
              depth={0}
              pathname={location.pathname}
              openGroups={openGroups}
              onToggle={toggleGroup}
              onNavigate={onClose}
            />
          ))}
        </nav>

        {/* User footer */}
        {user && (
          <div className="px-3 pb-4 border-t border-warm-100 pt-3">
            <div className="flex items-center gap-3 rounded-xl bg-warm-50 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-xs text-gray-400 capitalize">{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
