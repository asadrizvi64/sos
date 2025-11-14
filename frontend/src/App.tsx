import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import PublicLayout from './components/PublicLayout';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Workflows from './pages/Workflows';
import WorkflowBuilder from './pages/WorkflowBuilder';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import Roles from './pages/Roles';
import Teams from './pages/Teams';
import InvitationAccept from './pages/InvitationAccept';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Landing from './pages/Landing';
import Preferences from './pages/Preferences';
import ActivityLog from './pages/ActivityLog';
import ApiKeys from './pages/ApiKeys';
import AuditLogs from './pages/AuditLogs';
import EmailTriggerMonitoring from './pages/EmailTriggerMonitoring';
import AdminTemplates from './pages/AdminTemplates';
import PerformanceMonitoring from './pages/PerformanceMonitoring';
import OSINTMonitoring from './pages/OSINTMonitoring';
import CopilotAgent from './pages/CopilotAgent';
import ObservabilityDashboard from './pages/ObservabilityDashboard';
import AgentCatalogue from './pages/AgentCatalogue';
import ConnectorMarketplace from './pages/ConnectorMarketplace';
import SandboxStudio from './pages/SandboxStudio';
import PolicyConfiguration from './pages/PolicyConfiguration';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Security from './pages/Security';
import Cookies from './pages/Cookies';
import Docs from './pages/Docs';
import Community from './pages/Community';
import Support from './pages/Support';
import Changelog from './pages/Changelog';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_ZXRoaWNhbC1oYXJlLTc5LmNsZXJrLmFjY291bnRzLmRldiQ';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // Consider data fresh for 30 seconds
      gcTime: 300000, // Keep unused data in cache for 5 minutes (renamed from cacheTime in v5)
      refetchOnWindowFocus: false, // Don't refetch on window focus
      retry: 1, // Retry failed requests once
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <PublicRoute>
                  <PublicLayout />
                </PublicRoute>
              }
            >
              <Route index element={<Landing />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="security" element={<Security />} />
              <Route path="cookies" element={<Cookies />} />
              <Route path="docs" element={<Docs />} />
              <Route path="community" element={<Community />} />
              <Route path="support" element={<Support />} />
              <Route path="changelog" element={<Changelog />} />
            </Route>
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <Signup />
                </PublicRoute>
              }
            />
            <Route
              path="/invitations/accept"
              element={<InvitationAccept />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="workflows" element={<Workflows />} />
              <Route path="workflows/:id" element={<WorkflowBuilder />} />
              <Route path="workflows/new" element={<WorkflowBuilder />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="settings/roles" element={<Roles />} />
              <Route path="settings/teams" element={<Teams />} />
              <Route path="preferences" element={<Preferences />} />
              <Route path="activity" element={<ActivityLog />} />
              <Route path="settings/api-keys" element={<ApiKeys />} />
              <Route path="settings/audit-logs" element={<AuditLogs />} />
              <Route path="monitoring/email-triggers" element={<EmailTriggerMonitoring />} />
              <Route path="monitoring/performance" element={<PerformanceMonitoring />} />
              <Route path="monitoring/osint" element={<OSINTMonitoring />} />
              <Route path="settings/templates" element={<AdminTemplates />} />
              <Route path="agents/copilot" element={<CopilotAgent />} />
              <Route path="agents/catalogue" element={<AgentCatalogue />} />
              <Route path="connectors" element={<ConnectorMarketplace />} />
              <Route path="sandbox" element={<SandboxStudio />} />
              <Route path="observability" element={<ObservabilityDashboard />} />
              <Route path="settings/policies" element={<PolicyConfiguration />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </ThemeProvider>
    </ClerkProvider>
    </QueryClientProvider>
  );
}

export default App;
