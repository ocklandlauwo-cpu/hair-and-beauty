import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  className?: string
}

export default function StatCard({ label, value, sub, className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-warm-200 bg-white p-5 shadow-sm', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
