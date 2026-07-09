import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Package, Boxes, Truck, ShoppingCart, CreditCard, FileText,
  Users, TrendingUp, ClipboardCheck, Clock, Receipt, UserRound, Tag, BarChart2,
  BrainCircuit, TrendingDown, ChevronDown, Trophy,
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
  roles: readonly Role[]
}

interface NavGroup {
  kind: 'group'
  label: string
  icon: LucideIcon
  roles: readonly Role[]
  children: { to: string; label: string; icon: LucideIcon }[]
}

type NavEntry = FlatLink | NavGroup

const allEntries: NavEntry[] = [
  { kind: 'link', to: '/',               label: 'Dashboard',      icon: LayoutDashboard, roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/products',       label: 'Products',       icon: Package,         roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/stock',          label: 'Stock',          icon: Boxes,           roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/purchases',      label: 'Purchases',      icon: CreditCard,      roles: ['admin', 'store_keeper'] },
  { kind: 'link', to: '/distributions',  label: 'Distributions',  icon: Truck,           roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/clients',        label: 'Clients',        icon: UserRound,       roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/sales',          label: 'Sales',          icon: ShoppingCart,    roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/reconciliations', label: 'Reconciliation', icon: ClipboardCheck, roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/attendance',     label: 'Attendance',     icon: Clock,           roles: ['admin', 'store_keeper', 'seller'] },
  { kind: 'link', to: '/news',           label: 'News',           icon: FileText,        roles: ['admin'] },
  { kind: 'link', to: '/expenses',       label: 'Expenses',       icon: Receipt,         roles: ['admin'] },
  { kind: 'link', to: '/categories',     label: 'Categories',     icon: Tag,             roles: ['admin'] },
  { kind: 'link', to: '/graphical-view', label: 'Graphical View', icon: BarChart2,       roles: ['admin'] },
  { kind: 'link', to: '/users',          label: 'Users',          icon: Users,           roles: ['admin'] },
  { kind: 'link', to: '/reports/pnl',    label: 'P&L Report',     icon: TrendingUp,      roles: ['admin', 'store_keeper'] },
  {
    kind: 'group',
    label: 'AI - Report',
    icon: BrainCircuit,
    roles: ['admin'],
    children: [
      { to: '/ai-reports/slow-products', label: 'Slow Products',       icon: TrendingDown },
      { to: '/ai-reports/top-clients',   label: 'Top Client Spend', icon: Trophy },
    ],
  },
]

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
      if (e.kind === 'group' && e.children.some(c => location.pathname.startsWith(c.to))) {
        initial.add(e.label)
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
          {entries.map(entry => {
            if (entry.kind === 'link') {
              const Icon = entry.icon
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 h-9 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-500 hover:bg-warm-100 hover:text-gray-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} aria-hidden="true" className={isActive ? 'text-primary-600' : 'text-gray-400'} />
                      {entry.label}
                    </>
                  )}
                </NavLink>
              )
            }

            // Group entry
            const GroupIcon = entry.icon
            const isGroupActive = entry.children.some(c => location.pathname.startsWith(c.to))
            const isGroupOpen = openGroups.has(entry.label) || isGroupActive

            return (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 h-9 text-sm font-medium transition-colors',
                    isGroupActive
                      ? 'text-primary-700'
                      : 'text-gray-500 hover:bg-warm-100 hover:text-gray-900',
                  )}
                >
                  <GroupIcon size={16} aria-hidden="true" className={isGroupActive ? 'text-primary-600' : 'text-gray-400'} />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown
                    size={14}
                    className={cn(
                      'text-gray-400 transition-transform duration-200',
                      isGroupOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isGroupOpen && (
                  <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
                    {entry.children.map(child => {
                      const ChildIcon = child.icon
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2.5 rounded-lg px-3 h-8 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-gray-500 hover:bg-warm-100 hover:text-gray-900',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <ChildIcon size={14} aria-hidden="true" className={isActive ? 'text-primary-600' : 'text-gray-400'} />
                              {child.label}
                            </>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
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
