import { Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { AuthProvider } from '@/lib/auth'
import Account from '@/pages/Account'
import BarnDetail from '@/pages/BarnDetail'
import Barns from '@/pages/Barns'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import NotFound from '@/pages/NotFound'
import Register from '@/pages/Register'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/barns" element={<Barns />} />
          <Route path="/barns/:id" element={<BarnDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<Account />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
