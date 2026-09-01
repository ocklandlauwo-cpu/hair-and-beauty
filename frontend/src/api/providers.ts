import api from '@/lib/axios'

export interface Provider {
  id: number
  name: string
  phone: string | null
  is_active: boolean
}

export const providersApi = {
  list: () => api.get<{ data: Provider[] }>('/providers'),
  create: (data: { name: string; phone?: string | null }) =>
    api.post<{ data: Provider }>('/providers', data),
  update: (id: number, data: Partial<{ name: string; phone: string | null; is_active: boolean }>) =>
    api.put<{ data: Provider }>(`/providers/${id}`, data),
  delete: (id: number) => api.delete(`/providers/${id}`),
}
