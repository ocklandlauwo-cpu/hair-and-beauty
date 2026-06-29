import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Role } from '@/types'

interface RoleRouteProps {
  allow: Role[]
}

export default function RoleRoute({ allow }: RoleRouteProps) {
  const { user } = useAuth()
  if (!user || !allow.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
