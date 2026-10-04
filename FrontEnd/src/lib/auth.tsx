import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, getMe, loginUser, registerUser } from '@/lib/api'
import type { RegisterInput, User } from '@/lib/api'

const TOKEN_KEY = 'raaaa_token'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable: the session just will not survive a reload
  }
}

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => readToken())
  const [loading, setLoading] = useState<boolean>(() => readToken() !== null)

  useEffect(() => {
    const token = readToken()
    if (!token) return
    let cancelled = false
    getMe(token)
      .then((res) => {
        if (!cancelled) setUser(res.user)
      })
      .catch((err: unknown) => {
        // Only a real 401 means the token is bad. A network blip keeps it.
        if (err instanceof ApiError && err.status === 401) {
          writeToken(null)
          if (!cancelled) setToken(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginUser(email, password)
    writeToken(res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const res = await registerUser(input)
    writeToken(res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    writeToken(null)
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
