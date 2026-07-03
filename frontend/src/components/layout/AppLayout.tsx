import { useState, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api/auth'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import Header from './Header'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [showWarning, setShowWarning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const onWarn = useCallback(() => setShowWarning(true), [])

  const onTimeout = useCallback(async () => {
    setShowWarning(false)
    try { await authApi.logout() } catch { /* ignore — token may already be invalid */ }
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const { reset } = useIdleTimer(onWarn, onTimeout)

  const handleStayLoggedIn = () => {
    setShowWarning(false)
    reset()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={20} className="text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Session Expiring Soon</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              You've been inactive for a while. You'll be signed out in 5 minutes unless you continue.
            </p>
            <button
              onClick={handleStayLoggedIn}
              className="w-full rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700"
            >
              Stay Logged In
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
