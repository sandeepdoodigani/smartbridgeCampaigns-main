import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Loader2, ShieldX } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import CampaignNew from "@/pages/CampaignNew";
import CampaignAnalytics from "@/pages/CampaignAnalytics";
import Subscribers from "@/pages/Subscribers";
import Segments from "@/pages/Segments";
import Settings from "@/pages/Settings";
import AuditLogs from "@/pages/AuditLogs";
import Login from "@/pages/Login";

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <ShieldX className="w-16 h-16 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-4">You don't have permission to access this page.</p>
        <a href="/" className="text-primary hover:underline">Return to Dashboard</a>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  
  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, isAdmin } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (!isAdmin) return <AccessDenied />;
  
  return <Component />;
}

function CampaignRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, canManageCampaigns } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (!canManageCampaigns) return <AccessDenied />;
  
  return <Component />;
}

function AssociateRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, canManageSubscribers } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect to="/login" />;
  if (!canManageSubscribers) return <AccessDenied />;
  
  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (user) return <Redirect to="/" />;
  
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={() => <PublicRoute component={Login} />} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/campaigns/new" component={() => <CampaignRoute component={CampaignNew} />} />
      <Route path="/campaigns/:id/edit" component={() => <CampaignRoute component={CampaignNew} />} />
      <Route path="/campaigns/:id/analytics" component={() => <ProtectedRoute component={CampaignAnalytics} />} />
      <Route path="/subscribers" component={() => <AssociateRoute component={Subscribers} />} />
      <Route path="/segments" component={() => <AssociateRoute component={Segments} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/audit-logs" component={() => <AdminRoute component={AuditLogs} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
