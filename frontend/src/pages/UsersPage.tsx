import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/api/users'
import DataTable from '@/components/ui/DataTable'
import Badge from '@/components/ui/Badge'
import type { User } from '@/types'

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Role', render: (u: User) => <Badge>{u.role.replace('_', ' ')}</Badge> },
  { key: 'is_active', header: 'Status', render: (u: User) => <Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
]

export default function UsersPage() {
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
      <DataTable columns={columns} data={data?.data ?? []} isLoading={isLoading} emptyMessage="No users found." />
    </div>
  )
}
