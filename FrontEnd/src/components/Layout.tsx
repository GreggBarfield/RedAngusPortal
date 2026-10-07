import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { getCattlePendingCount } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

// A button that opens a small menu. Closes on outside click, Escape, or when a choice is made.
function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Close when the page changes (not on first appearance, which could undo a quick first click).
  const lastPath = useRef(location.pathname)
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    setOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
        {label}
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-48 rounded-md border bg-card p-1 shadow-md">
          {children}
        </div>
      )}
    </div>
  )
}

function MenuLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link role="menuitem" to={to} className="block rounded-sm px-3 py-2 text-sm hover:bg-accent">
      {children}
    </Link>
  )
}

const topLink = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-3 py-2 text-sm font-medium hover:bg-accent', isActive ? 'text-primary' : 'text-foreground')

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
    Promise.all([getCattlePendingCount('feeder', token), getCattlePendingCount('breeding', token)])
      .then(([a, b]) => {
        if (!cancelled) setPending(a.pending + b.pending)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isStaff, token, location.pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-14 w-full max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-1">
            <Link to="/" className="mr-4 font-semibold tracking-tight">
              Red Angus Portal
            </Link>
            <NavLink to="/search/feeder" className={() => topLink({ isActive: location.pathname.startsWith('/search') })}>
              Search For Cattle
            </NavLink>
            <NavLink to="/list/feeder" className={() => topLink({ isActive: location.pathname.startsWith('/list') })}>
              List Your Cattle
            </NavLink>
          </div>
          <nav className="flex items-center gap-1" aria-label="Account">
            {isStaff && (
              <Menu label={pending > 0 ? `Staff Tools (${pending})` : 'Staff Tools'}>
                <MenuLink to="/staff/review">Review listings{pending > 0 ? ` (${pending})` : ''}</MenuLink>
                <MenuLink to="/barns">Sale barns</MenuLink>
                <MenuLink to="/feedlots">Feedlots</MenuLink>
              </Menu>
            )}
            {loading ? null : user ? (
              <Menu label={user.displayName}>
                <MenuLink to="/my-listings">My listings</MenuLink>
                <MenuLink to="/account">Account</MenuLink>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    logout()
                    navigate('/')
                  }}
                >
                  Sign out
                </button>
              </Menu>
            ) : (
              <>
                <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
                  Sign in
                </Link>
                <Link to="/register" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-6">
          <span>Red Angus Association Marketing Portal</span>
          <span className="flex gap-4">
            <Link to="/barns" className="hover:text-foreground hover:underline">
              Sale barns
            </Link>
            <Link to="/feedlots" className="hover:text-foreground hover:underline">
              Feedlots
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
