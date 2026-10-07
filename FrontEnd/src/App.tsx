import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { AuthProvider } from '@/lib/auth'
import Account from '@/pages/Account'
import BarnDetail from '@/pages/BarnDetail'
import Feedlots from '@/pages/Feedlots'
import FeedlotDetail from '@/pages/FeedlotDetail'
import FeedlotNew from '@/pages/FeedlotNew'
import Barns from '@/pages/Barns'
import CattleDetail from '@/pages/CattleDetail'
import Home from '@/pages/Home'
import ListCattle from '@/pages/ListCattle'
import Login from '@/pages/Login'
import MyListings from '@/pages/MyListings'
import NotFound from '@/pages/NotFound'
import Register from '@/pages/Register'
import SearchCattle from '@/pages/SearchCattle'
import StaffReview from '@/pages/StaffReview'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/barns" element={<Barns />} />
          <Route path="/barns/:id" element={<BarnDetail />} />
          <Route path="/feedlots" element={<Feedlots />} />
          <Route path="/feedlots/:id" element={<FeedlotDetail />} />
          <Route path="/search" element={<Navigate to="/search/feeder" replace />} />
          <Route path="/search/feeder" element={<SearchCattle kind="feeder" />} />
          <Route path="/search/breeding" element={<SearchCattle kind="breeding" />} />
          <Route path="/feeder/:id" element={<CattleDetail kind="feeder" />} />
          <Route path="/breeding/:id" element={<CattleDetail kind="breeding" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<Account />} />
            <Route path="/list" element={<Navigate to="/list/feeder" replace />} />
            <Route path="/list/feeder" element={<ListCattle kind="feeder" />} />
            <Route path="/list/breeding" element={<ListCattle kind="breeding" />} />
            <Route path="/list/feeder/:id/edit" element={<ListCattle kind="feeder" />} />
            <Route path="/list/breeding/:id/edit" element={<ListCattle kind="breeding" />} />
            <Route path="/my-listings" element={<MyListings />} />
            <Route path="/staff/review" element={<StaffReview />} />
            <Route path="/feedlots/new" element={<FeedlotNew />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
