import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LogIn, LogOut, MapPin, AlertCircle } from 'lucide-react'
import { attendanceApi, type AttendanceRecord } from '@/api/attendance'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'

const columns = [
  { key: 'action', header: 'Action', render: (r: AttendanceRecord) => (
    <Badge variant={r.action === 'clock_in' ? 'success' : 'default'}>
      {r.action === 'clock_in' ? 'Clock In' : 'Clock Out'}
    </Badge>
  )},
  { key: 'recorded_at', header: 'Time', render: (r: AttendanceRecord) => new Date(r.recorded_at).toLocaleString() },
  { key: 'is_within_geofence', header: 'Geofence', render: (r: AttendanceRecord) => (
    <Badge variant={r.is_within_geofence ? 'success' : 'danger'}>
      {r.is_within_geofence ? 'Within' : 'Outside'}
    </Badge>
  )},
]

export default function AttendancePage() {
  const qc = useQueryClient()
  const [geoError, setGeoError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ action: string; within: boolean; distance: number | null } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['attendance'],
    queryFn: () => attendanceApi.list().then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: attendanceApi.clock,
    onSuccess: (res) => {
      const d = res.data.data
      setLastResult({ action: d.action, within: d.is_within_geofence, distance: d.distance_m })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setGeoError(null)
    },
    onError: (err: unknown) => {
      type ApiErr = { response?: { data?: { message?: string } } }
      const msg = (err as ApiErr)?.response?.data?.message
      setGeoError(msg ?? 'Failed to record attendance. Please try again.')
    },
  })

  const requestGeolocation = (action: 'clock_in' | 'clock_out') => {
    setGeoError(null)
    setLastResult(null)
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mutation.mutate({
          action,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => setGeoError('Unable to get your location. Please allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const todayStr = new Date().toLocaleDateString()
  const todayRecords = (data?.data ?? []).filter(r => new Date(r.recorded_at).toLocaleDateString() === todayStr)
  const lastActionToday = todayRecords[0]?.action ?? null

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>

      {/* Clock actions */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-sm space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <MapPin size={14} />
          <span>Your location will be recorded</span>
        </div>

        {lastActionToday && (
          <p className="text-sm text-gray-600">
            Last action today:{' '}
            <Badge variant={lastActionToday === 'clock_in' ? 'success' : 'default'}>
              {lastActionToday === 'clock_in' ? 'Clock In' : 'Clock Out'}
            </Badge>
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => requestGeolocation('clock_in')}
            disabled={mutation.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary-600 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <LogIn size={16} /> Clock In
          </button>
          <button
            onClick={() => requestGeolocation('clock_out')}
            disabled={mutation.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-200 h-10 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <LogOut size={16} /> Clock Out
          </button>
        </div>

        {mutation.isPending && <p className="text-sm text-gray-500 text-center">Getting your location…</p>}

        {geoError && (
          <p className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} /> {geoError}
          </p>
        )}

        {lastResult && (
          <div className="rounded-md bg-gray-50 p-3 text-sm space-y-1">
            <p className="font-medium text-gray-800">
              {lastResult.action === 'clock_in' ? 'Clocked in' : 'Clocked out'} successfully
            </p>
            <p className="text-gray-500">
              Geofence:{' '}
              <Badge variant={lastResult.within ? 'success' : 'warning'}>
                {lastResult.within ? 'Within range' : 'Outside range'}
              </Badge>
              {lastResult.distance !== null && ` (${lastResult.distance.toFixed(0)} m away)`}
            </p>
          </div>
        )}
      </div>

      {/* Today's records */}
      {todayRecords.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Today's Records</h2>
          <DataTable columns={columns} data={todayRecords} emptyMessage="" />
        </div>
      )}

      {/* Full history */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Full History</h2>
        <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No attendance records." />
      </div>
    </div>
  )
}
