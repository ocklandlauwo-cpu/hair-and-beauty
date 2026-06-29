import api from '@/lib/axios'

export const reportsApi = {
  downloadWeekly: () =>
    api.get('/reports/weekly', { responseType: 'blob' }),
  downloadMonthly: () =>
    api.get('/reports/monthly', { responseType: 'blob' }),
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
