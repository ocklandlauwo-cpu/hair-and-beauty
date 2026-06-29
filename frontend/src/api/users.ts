import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse, User } from '@/types'

export const usersApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<User>>('/users', { params: { page } }),
  create: (data: { name: string; email: string; password: string; role: string; location_id?: number; is_active?: boolean }) =>
    api.post<ApiResponse<User>>('/users', data),
  update: (id: number, data: Partial<{ name: string; email: string; password: string; role: string; location_id: number | null; is_active: boolean }>) =>
    api.put<ApiResponse<User>>(`/users/${id}`, data),
}
