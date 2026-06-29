import api from '@/lib/axios'
import type { PaginatedResponse } from '@/types'

export interface NewsItem {
  id: number
  title: string
  body: string
  is_published: boolean
  published_at: string | null
  created_at: string
}

export const newsApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<NewsItem>>('/news', { params: { page } }),
}
