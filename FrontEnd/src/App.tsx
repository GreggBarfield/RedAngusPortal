import { Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { AuthProvider } from '@/lib/auth'
import Account from '@/pages/Account'
import BarnDetail from '@/pages/BarnDetail'
import Barns from '@/pages/Barns'
import Home from '@/pages/Home'
import ListingDetail from '@/pages/ListingDetail'
import ListingForm from '@/pages/ListingForm'
import Listings from '@/pages/Listings'
import Login from '@/pages/Login'
import MyListings from '@/pages/MyListings'
import NotFound from '@/pages/NotFound'
import Register from '@/pages/Register'
import StaffReview from '@/pages/StaffReview'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/barns" element={<Barns />} />
          <Route path="/barns/:id" element={<BarnDetail />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<Account />} />
            <Route path="/listings/new" element={<ListingForm />} />
            <Route path="/listings/:id/edit" element={<ListingForm />} />
            <Route path="/my-listings" element={<MyListings />} />
            <Route path="/staff/review" element={<StaffReview />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
