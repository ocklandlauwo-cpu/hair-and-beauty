import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/auth'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-6">
      <div className="flex flex-1 items-center justify-between">
        <div />
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-gray-600">
              {user.name}
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 capitalize">
                {user.role.replace('_', ' ')}
              </span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 h-8 text-sm text-gray-600 hover:bg-gray-50"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
