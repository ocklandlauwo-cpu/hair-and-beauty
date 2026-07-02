import React from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T extends { id: number }> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  isLoading?: boolean
}

export default function DataTable<T extends { id: number }>({
  columns,
  data,
  emptyMessage = 'No records found.',
  isLoading,
}: DataTableProps<T>) {
  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
  }

  if (data.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">{emptyMessage}</div>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-warm-200 bg-white">
      <table className="min-w-full divide-y divide-warm-100 text-sm">
        <thead className="bg-warm-50">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-50">
          {data.map(row => (
            <tr key={row.id} className="hover:bg-warm-50/60 transition-colors">
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}>
                  {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
