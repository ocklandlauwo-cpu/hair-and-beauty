import api from '@/lib/axios'
import type { PaginatedResponse, ApiResponse } from '@/types'

export interface NewsItem {
  id: number
  title: string
  body: string
  is_published: boolean
  published_at: string | null
  created_at: string
}

export interface NewsPayload {
  title: string
  body: string
  is_published?: boolean
}

export const newsApi = {
  list: (page = 1) =>
    api.get<PaginatedResponse<NewsItem>>('/news', { params: { page } }),
  create: (data: NewsPayload) =>
    api.post<ApiResponse<NewsItem>>('/news', data),
  update: (id: number, data: Partial<NewsPayload>) =>
    api.put<ApiResponse<NewsItem>>(`/news/${id}`, data),
  destroy: (id: number) =>
    api.delete<{ message: string }>(`/news/${id}`),
}
