import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, AuthUser } from "@/lib/api";
import { useLocation } from "wouter";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isAssociate: boolean;
  isAnalyst: boolean;
  canManageCampaigns: boolean;
  canManageSubscribers: boolean;
  canViewAnalytics: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    api.auth.me()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const user = await api.auth.login({ email, password });
    setUser(user);
    setLocation("/");
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    setLocation("/login");
  };

  const isAdmin = user?.role === 'admin';
  const isAssociate = user?.role === 'associate';
  const isAnalyst = user?.role === 'analyst';
  const canManageCampaigns = isAdmin || isAssociate;
  const canManageSubscribers = isAdmin || isAssociate;
  const canViewAnalytics = true;

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      logout,
      isAdmin,
      isAssociate,
      isAnalyst,
      canManageCampaigns,
      canManageSubscribers,
      canViewAnalytics,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
