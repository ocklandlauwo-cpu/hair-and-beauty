import api from '@/lib/axios'

export interface Location {
  id: number
  name: string
  type: 'store' | 'shop'
  geofence_lat: string | null
  geofence_lng: string | null
  geofence_radius_m: number
  is_active: boolean
}

export const locationsApi = {
  list: () => api.get<{ data: Location[] }>('/locations'),
  updateGeofence: (id: number, data: { geofence_lat: number; geofence_lng: number; geofence_radius_m?: number }) =>
    api.patch<{ data: Location }>(`/locations/${id}`, data),
}
