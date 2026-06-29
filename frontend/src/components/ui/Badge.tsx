import { cn } from '@/lib/utils'

const variants = {
  default:    'bg-gray-100 text-gray-700',
  primary:    'bg-primary-50 text-primary-700',
  success:    'bg-green-100 text-green-700',
  warning:    'bg-yellow-100 text-yellow-700',
  danger:     'bg-red-100 text-red-700',
  info:       'bg-blue-100 text-blue-700',
} as const

interface BadgeProps {
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
