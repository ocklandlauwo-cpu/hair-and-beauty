import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import type { User } from '@/types'

const mockUser: User = { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', location_id: null, is_active: true, created_at: '', updated_at: '' }

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

beforeEach(() => {
  localStorage.clear()
})

describe('AuthContext', () => {
  it('starts unauthenticated', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('login sets user and token', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => { result.current.login('tok123', mockUser) })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.email).toBe('admin@test.com')
    expect(localStorage.getItem('auth_token')).toBe('tok123')
  })

  it('logout clears user and storage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => { result.current.login('tok', mockUser) })
    act(() => { result.current.logout() })
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
