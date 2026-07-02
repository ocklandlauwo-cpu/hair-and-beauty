import api from '@/lib/axios'

export interface Category {
  id: number
  name: string
}

export const categoriesApi = {
  list: () => api.get<{ data: Category[] }>('/categories'),
  create: (data: { name: string }) => api.post<{ data: Category }>('/categories', data),
  update: (id: number, data: { name: string }) => api.put<{ data: Category }>(`/categories/${id}`, data),
}
