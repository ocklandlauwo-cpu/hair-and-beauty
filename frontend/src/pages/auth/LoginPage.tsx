import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api/auth'
import { useAuth } from '@/contexts/AuthContext'

const schema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const res = await authApi.login(values)
      const { token, user } = res.data.data
      login(token, user)
      navigate('/', { replace: true })
    } catch {
      setServerError('Invalid email or password.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-warm-50">
      <div className="w-full max-w-sm">

        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-lg">
            <span className="text-lg font-extrabold text-white">H&amp;B</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-gray-900">Welcome back</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to Hair &amp; Beauty Intelligence</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-warm-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="block w-full rounded-lg border border-warm-200 px-3 h-10 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="block w-full rounded-lg border border-warm-200 px-3 h-10 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {serverError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary-600 px-4 h-11 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
