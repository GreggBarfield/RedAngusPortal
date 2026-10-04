import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getFeederPendingCount, getPendingCount } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Layout() {
  const { user, token, loading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pending, setPending] = useState(0)
  const isStaff = user?.role === 'staff'

  useEffect(() => {
    if (!isStaff || !token) {
      setPending(0)
      return
    }
    let cancelled = false
    Promise.all([getPendingCount(token), getFeederPendingCount(token)])
      .then(([a, b]) => {
        if (!cancelled) setPending(a.pending + b.pending)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isStaff, token, location.pathname])

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="font-semibold tracking-tight">
              Red Angus Portal
            </Link>
            <Link to="/listings" className="text-sm text-muted-foreground hover:text-foreground">
              Cattle
            </Link>
            <Link to="/feeders" className="text-sm text-muted-foreground hover:text-foreground">
              Feeders
            </Link>
            <Link to="/barns" className="text-sm text-muted-foreground hover:text-foreground">
              Sale barns
            </Link>
            {user && (
              <Link to="/my-listings" className="text-sm text-muted-foreground hover:text-foreground">
                My listings
              </Link>
            )}
            {isStaff && (
              <Link to="/staff/review" className="text-sm text-muted-foreground hover:text-foreground">
                Review{pending > 0 ? ` (${pending})` : ''}
              </Link>
            )}
          </div>
          <nav className="flex items-center gap-2" aria-label="Account">
            {loading ? null : user ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/account">{user.displayName}</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
