import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AccountSecurityPage from './pages/AccountSecurityPage';
import AdminPage from './pages/AdminPage';
import AccountDisabledPage from './pages/AccountDisabledPage';
import ContactPage from './pages/ContactPage';
import BookingsPage from './pages/BookingsPage';
import BrowseGigsPage from './pages/BrowseGigsPage';
import GigDetailPage from './pages/GigDetailPage';
import HomePage from './pages/HomePage';
import IncomePage from './pages/IncomePage';
import { HelpPage, PrivacyPage, TermsPage } from './pages/InfoPages';
import LoginPage from './pages/LoginPage';
import MyGigsPage from './pages/MyGigsPage';
import NotFoundPage from './pages/NotFoundPage';
import PaymentsPage from './pages/PaymentsPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import MessagesPage from './pages/MessagesPage';
import { ROLES } from './utils/constants';

export default function App() {
  const { CLIENT, FREELANCER, ADMIN } = ROLES;
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* public: anyone can look around before signing up */}
        <Route path="/" element={<HomePage />} />
        <Route path="/gigs" element={<BrowseGigsPage />} />
        <Route path="/gigs/:id" element={<GigDetailPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account-disabled" element={<AccountDisabledPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* signed-in areas, guarded by role */}
        <Route path="/my-gigs" element={<ProtectedRoute roles={[FREELANCER]}><MyGigsPage /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={[CLIENT, FREELANCER]}><BookingsPage /></ProtectedRoute>} />
        <Route path="/income" element={<ProtectedRoute roles={[FREELANCER]}><IncomePage /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute roles={[CLIENT]}><PaymentsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute roles={[ADMIN]}><AdminPage /></ProtectedRoute>} />
        <Route path="/account/security" element={<ProtectedRoute><AccountSecurityPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute roles={[CLIENT, FREELANCER]}><MessagesPage /></ProtectedRoute>} />
        <Route path="/messages/:id" element={<ProtectedRoute roles={[CLIENT, FREELANCER]}><MessagesPage /></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
