import api from '@/lib/axios'

export interface SaloonService {
  id: number
  name: string
  is_active: boolean
}

export const saloonServicesApi = {
  list: () => api.get<{ data: SaloonService[] }>('/saloon-services'),
  create: (data: { name: string }) =>
    api.post<{ data: SaloonService }>('/saloon-services', data),
  update: (id: number, data: Partial<{ name: string; is_active: boolean }>) =>
    api.put<{ data: SaloonService }>(`/saloon-services/${id}`, data),
  delete: (id: number) => api.delete(`/saloon-services/${id}`),
}
