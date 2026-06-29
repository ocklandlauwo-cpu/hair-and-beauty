import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface AttendanceRecord {
  id: number
  user_id: number
  location_id: number
  action: 'clock_in' | 'clock_out'
  latitude: string
  longitude: string
  is_within_geofence: boolean
  recorded_at: string
}

export interface ClockPayload {
  action: 'clock_in' | 'clock_out'
  latitude: number
  longitude: number
}

export interface ClockResponse {
  id: number
  action: 'clock_in' | 'clock_out'
  is_within_geofence: boolean
  distance_m: number | null
  recorded_at: string
}

export const attendanceApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params: { page } }),
  clock: (data: ClockPayload) =>
    api.post<ApiResponse<ClockResponse>>('/attendance', data),
}
