import api from '@/lib/axios'

export interface Category {
  id: number
  name: string
}

export const categoriesApi = {
  list: () => api.get<{ data: Category[] }>('/categories'),
}
