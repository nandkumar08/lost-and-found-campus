import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import PublicLayout from '../layouts/PublicLayout';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';

import Home from '../pages/public/Home';
import Browse from '../pages/public/Browse';
import ItemDetail from '../pages/public/ItemDetail';
import ReportForm from '../pages/public/ReportForm';
import Track from '../pages/public/Track';
import Scan from '../pages/public/Scan';
import { About, Contact, HowItWorks } from '../pages/public/Info';
import { ForgotPassword, Login, Register, ResetPassword } from '../pages/public/Auth';
import { Forbidden, NotFound } from '../pages/public/NotFound';

import Overview from '../pages/dashboard/Overview';
import Reports from '../pages/dashboard/Reports';
import Matches from '../pages/dashboard/Matches';
import Claims, { ClaimSubmit } from '../pages/dashboard/Claims';
import Returns from '../pages/dashboard/Returns';
import { Notifications, Profile, Verification } from '../pages/dashboard/AccountPages';
import { Users, Verifications } from '../pages/dashboard/AdminPeople';
import {
  ActivityLogs,
  Categories,
  EmailLog,
  Locations,
  UniversitySettings
} from '../pages/dashboard/AdminConfig';
import Analytics from '../pages/dashboard/Analytics';
import { Custody, Intake, QrScanner } from '../pages/dashboard/Custody';
import { Onboarding, PlatformAnalytics, PlatformLogs, PlatformSettings, Universities } from '../pages/dashboard/Platform';

const MEMBER_ROLES = ['student', 'faculty', 'university_staff', 'campus_member'];
const STAFF_ROLES = ['security_personnel', 'university_admin'];
const ALL_WORKSPACE_ROLES = [...MEMBER_ROLES, ...STAFF_ROLES];

/**
 * Route guard. Client-side guards improve UX only — every endpoint is
 * independently authorised on the server, which is the security boundary.
 */
function RequireRole({ roles, children }) {
  const { user, booting } = useAuth();
  if (booting) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Forbidden />;
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* ----------------------------- public ----------------------------- */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/browse/:type" element={<Browse />} />
        <Route path="/items/:code" element={<ItemDetail />} />
        <Route path="/report/:type" element={<ReportForm />} />
        <Route path="/track" element={<Track />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ------------------------------ auth ------------------------------ */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* --------------------------- workspace --------------------------- */}
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Overview />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:type" element={<Reports />} />

        <Route path="matches" element={<RequireRole roles={ALL_WORKSPACE_ROLES}><Matches /></RequireRole>} />
        <Route path="claims" element={<RequireRole roles={ALL_WORKSPACE_ROLES}><Claims /></RequireRole>} />
        <Route path="returns" element={<RequireRole roles={ALL_WORKSPACE_ROLES}><Returns /></RequireRole>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="verification" element={<Verification />} />

        {/* custody desk */}
        <Route path="intake" element={<RequireRole roles={STAFF_ROLES}><Intake /></RequireRole>} />
        <Route path="custody" element={<RequireRole roles={STAFF_ROLES}><Custody /></RequireRole>} />
        <Route path="scan" element={<RequireRole roles={STAFF_ROLES}><QrScanner /></RequireRole>} />

        {/* university administration */}
        <Route path="users" element={<RequireRole roles={['university_admin']}><Users /></RequireRole>} />
        <Route path="verifications" element={<RequireRole roles={['university_admin']}><Verifications /></RequireRole>} />
        <Route path="locations" element={<RequireRole roles={['university_admin', 'security_personnel']}><Locations /></RequireRole>} />
        <Route path="categories" element={<RequireRole roles={['university_admin']}><Categories /></RequireRole>} />
        <Route path="analytics" element={<RequireRole roles={['university_admin']}><Analytics /></RequireRole>} />
        <Route path="logs" element={<RequireRole roles={['university_admin']}><ActivityLogs /></RequireRole>} />
        <Route path="email-log" element={<RequireRole roles={['university_admin']}><EmailLog /></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={['university_admin']}><UniversitySettings /></RequireRole>} />

        {/* platform administration */}
        <Route path="platform/overview" element={<RequireRole roles={['platform_admin']}><Overview /></RequireRole>} />
        <Route path="platform/universities" element={<RequireRole roles={['platform_admin']}><Universities /></RequireRole>} />
        <Route path="platform/onboarding" element={<RequireRole roles={['platform_admin']}><Onboarding /></RequireRole>} />
        <Route path="platform/analytics" element={<RequireRole roles={['platform_admin']}><PlatformAnalytics /></RequireRole>} />
        <Route path="platform/settings" element={<RequireRole roles={['platform_admin']}><PlatformSettings /></RequireRole>} />
        <Route path="platform/logs" element={<RequireRole roles={['platform_admin']}><PlatformLogs /></RequireRole>} />
      </Route>

      {/* claim submission uses the workspace chrome */}
      <Route path="/claim/:code" element={<DashboardLayout />}>
        <Route index element={<RequireRole roles={ALL_WORKSPACE_ROLES}><ClaimSubmit /></RequireRole>} />
      </Route>
    </Routes>
  );
}
