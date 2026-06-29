import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, Boxes, Truck, ShoppingCart, CreditCard, FileText, Users, TrendingUp, ClipboardCheck, Clock, Receipt } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const allLinks = [
  { to: '/',             label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/products',     label: 'Products',     icon: Package,         roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/stock',        label: 'Stock',        icon: Boxes,           roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/purchases',    label: 'Purchases',    icon: CreditCard,      roles: ['admin', 'store_keeper'] as const },
  { to: '/distributions',label: 'Distributions',icon: Truck,           roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/sales',           label: 'Sales',          icon: ShoppingCart,   roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/reconciliations', label: 'Reconciliation', icon: ClipboardCheck, roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/attendance',      label: 'Attendance',     icon: Clock,          roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/news',            label: 'News',           icon: FileText,       roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/expenses',        label: 'Expenses',       icon: Receipt,        roles: ['admin', 'store_keeper', 'seller'] as const },
  { to: '/users',        label: 'Users',        icon: Users,           roles: ['admin'] as const },
  { to: '/reports/pnl',  label: 'P&L Report',   icon: TrendingUp,      roles: ['admin', 'store_keeper'] as const },
]

export default function Sidebar() {
  const { user } = useAuth()
  const role = user?.role ?? 'seller'
  const links = allLinks.filter(l => l.roles.includes(role as never))

  return (
    <aside
      className="flex w-64 shrink-0 flex-col bg-primary-900"
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center px-6">
        <span className="text-sm font-semibold text-white">Hair & Beauty</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 h-9 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
