import api from '@/lib/axios'
import type { ApiResponse, User } from '@/types'

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthTokenResponse {
  token: string
  user: User
}

export const authApi = {
  login: (payload: LoginPayload) =>
    api.post<ApiResponse<AuthTokenResponse>>('/auth/login', payload),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<ApiResponse<User>>('/auth/me'),
}
