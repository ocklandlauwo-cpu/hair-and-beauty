import { LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/auth'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 shrink-0 items-center border-b border-warm-100 bg-white px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="lg:hidden mr-3 rounded-lg p-1.5 text-gray-500 hover:bg-warm-50 hover:text-gray-800 transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div className="flex flex-1 items-center justify-end gap-3 min-w-0">
        {user && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:block text-sm font-medium text-gray-700 truncate">{user.name}</span>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 capitalize whitespace-nowrap">
              {user.role.replace('_', ' ')}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-warm-200 px-3 h-8 text-sm text-gray-500 hover:bg-warm-50 hover:text-gray-800 transition-colors whitespace-nowrap"
          aria-label="Sign out"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
