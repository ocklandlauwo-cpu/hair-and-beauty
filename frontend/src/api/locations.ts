import api from '@/lib/axios'

export interface Location {
  id: number
  name: string
  type: 'store' | 'shop'
  is_active: boolean
}

export const locationsApi = {
  list: () => api.get<{ data: Location[] }>('/locations'),
}
