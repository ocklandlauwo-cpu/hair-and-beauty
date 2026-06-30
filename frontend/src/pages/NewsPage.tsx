import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { newsApi, type NewsItem, type NewsPayload } from '@/api/news'
import { useAuth } from '@/contexts/AuthContext'
import Badge from '@/components/ui/Badge'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function NewsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin'

  // form state
  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<NewsItem | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formPublished, setFormPublished] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['news'],
    queryFn: () => newsApi.list().then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: NewsPayload) =>
      editItem ? newsApi.update(editItem.id, payload) : newsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news'] })
      closeForm()
    },
    onError: () => setFormError('Failed to save. Check all fields.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => newsApi.destroy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }),
  })

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      newsApi.update(id, { is_published: published }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }),
  })

  const openCreate = () => {
    setEditItem(null)
    setFormTitle('')
    setFormBody('')
    setFormPublished(false)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (item: NewsItem) => {
    setEditItem(item)
    setFormTitle(item.title)
    setFormBody(item.body)
    setFormPublished(item.is_published)
    setFormError(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditItem(null)
    setFormTitle('')
    setFormBody('')
    setFormPublished(false)
    setFormError(null)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) { setFormError('Title is required.'); return }
    if (!formBody.trim()) { setFormError('Body is required.'); return }
    setFormError(null)
    saveMutation.mutate({ title: formTitle.trim(), body: formBody.trim(), is_published: formPublished })
  }

  const handleDelete = (item: NewsItem) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return
    deleteMutation.mutate(item.id)
  }

  const items = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">News & Announcements</h1>
        {isAdmin && !formOpen && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md bg-primary-600 px-4 h-9 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {/* Admin create/edit form */}
      {isAdmin && formOpen && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            {editItem ? 'Edit Announcement' : 'New Announcement'}
          </h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label htmlFor="news-title" className="block text-sm font-medium text-gray-700">Title</label>
              <input
                id="news-title"
                type="text"
                required
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            <div>
              <label htmlFor="news-body" className="block text-sm font-medium text-gray-700">Body</label>
              <textarea
                id="news-body"
                rows={5}
                required
                value={formBody}
                onChange={e => setFormBody(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="news-published"
                type="checkbox"
                checked={formPublished}
                onChange={e => setFormPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
              />
              <label htmlFor="news-published" className="text-sm font-medium text-gray-700">
                Publish immediately
              </label>
            </div>
            {formError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={closeForm} className="rounded-md border border-gray-200 px-4 h-10 text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-md bg-primary-600 px-6 h-10 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : editItem ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* News list */}
      {isLoading && (
        <p className="text-sm text-gray-500">Loading announcements…</p>
      )}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-gray-500">No announcements yet.</p>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  {isAdmin && (
                    <Badge variant={item.is_published ? 'success' : 'default'}>
                      {item.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.body}</p>
                <p className="mt-2 text-xs text-gray-400">
                  {item.published_at ? formatDate(item.published_at) : formatDate(item.created_at)}
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => togglePublishMutation.mutate({ id: item.id, published: !item.is_published })}
                    disabled={togglePublishMutation.isPending}
                    className="text-xs text-primary-600 hover:underline disabled:opacity-50"
                    aria-label={item.is_published ? `Unpublish ${item.title}` : `Publish ${item.title}`}
                  >
                    {item.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label={`Edit ${item.title}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-gray-300 hover:text-red-500"
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
