import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AdminUser, UserRole } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle, AlertCircle, Cloud, LogOut, User, Mail, Server, Webhook, Copy, Users, Plus, Trash2, Shield, Power, PowerOff } from "lucide-react";

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-west-2", label: "EU (London)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState("us-east-1");

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");

  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("associate");
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(false);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [showCreatedUserInfo, setShowCreatedUserInfo] = useState<{ email: string; password?: string; emailSent?: boolean; emailError?: string } | null>(null);
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: sesSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["ses-settings"],
    queryFn: api.settings.getSES,
  });

  const { data: webhookInfo } = useQuery({
    queryKey: ["webhook-info"],
    queryFn: api.settings.getWebhookInfo,
  });

  const { data: senderIdentities = [], isLoading: loadingSenders } = useQuery({
    queryKey: ["sender-identities"],
    queryFn: api.settings.getSenders,
  });

  const [showAddSender, setShowAddSender] = useState(false);
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [newSenderName, setNewSenderName] = useState("");
  const [newSenderIsDefault, setNewSenderIsDefault] = useState(false);

  const createSenderMutation = useMutation({
    mutationFn: api.settings.createSender,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-identities"] });
      setShowAddSender(false);
      setNewSenderEmail("");
      setNewSenderName("");
      setNewSenderIsDefault(false);
      toast({
        title: "Sender Added",
        description: "The sender email address has been added.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Add Sender",
        description: error.message,
      });
    },
  });

  const deleteSenderMutation = useMutation({
    mutationFn: api.settings.deleteSender,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-identities"] });
      toast({
        title: "Sender Removed",
        description: "The sender email address has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Remove Sender",
        description: error.message,
      });
    },
  });

  const setDefaultSenderMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => api.settings.updateSender(id, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-identities"] });
      toast({
        title: "Default Sender Updated",
        description: "The default sender has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Update Default",
        description: error.message,
      });
    },
  });

  const activateSenderMutation = useMutation({
    mutationFn: api.settings.activateSender,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-identities"] });
      toast({
        title: "Sender Activated",
        description: "The sender email address has been activated.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Activate Sender",
        description: error.message,
      });
    },
  });

  const deactivateSenderMutation = useMutation({
    mutationFn: api.settings.deactivateSender,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sender-identities"] });
      toast({
        title: "Sender Deactivated",
        description: "The sender email address has been deactivated.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Deactivate Sender",
        description: error.message,
      });
    },
  });

  const { data: usersList, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.admin.listUsers,
  });

  const createUserMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreateUser(false);
      
      if (result.generatedPassword || sendWelcomeEmail) {
        setShowCreatedUserInfo({
          email: result.email,
          password: result.generatedPassword,
          emailSent: result.welcomeEmailSent,
          emailError: result.welcomeEmailError,
        });
      }
      
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserRole("associate");
      setAutoGeneratePassword(false);
      setSendWelcomeEmail(true);
      
      let description = "The new user has been created successfully.";
      if (result.welcomeEmailSent) {
        description += " A welcome email has been sent with login credentials.";
      } else if (result.welcomeEmailError) {
        description += ` Note: Welcome email could not be sent - ${result.welcomeEmailError}`;
      }
      
      toast({
        title: "User Created",
        description,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Create User",
        description: error.message,
      });
    },
  });
  
  const changePasswordMutation = useMutation({
    mutationFn: api.auth.changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Change Password",
        description: error.message,
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: api.admin.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "User Deleted",
        description: "The user has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Delete User",
        description: error.message,
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => 
      api.admin.updateUser(userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Role Updated",
        description: "The user's role has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Update Role",
        description: error.message,
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      email: newUserEmail,
      password: autoGeneratePassword ? undefined : newUserPassword,
      name: newUserName,
      role: newUserRole,
      autoGeneratePassword,
      sendWelcomeEmail,
    });
  };
  
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords Don't Match",
        description: "New password and confirmation must match.",
      });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const getRoleBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      admin: "bg-red-100 text-red-800 border-red-200",
      associate: "bg-blue-100 text-blue-800 border-blue-200",
      analyst: "bg-green-100 text-green-800 border-green-200",
    };
    return <Badge variant="outline" className={colors[role]}>{role}</Badge>;
  };

  const copyWebhookUrl = () => {
    if (webhookInfo?.webhookUrl) {
      navigator.clipboard.writeText(webhookInfo.webhookUrl);
      toast({
        title: "Copied!",
        description: "Webhook URL copied to clipboard.",
      });
    }
  };

  const saveApiMutation = useMutation({
    mutationFn: api.settings.saveSESApi,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ses-settings"] });
      if (result.isVerified) {
        toast({
          title: "Settings Saved",
          description: "Your AWS SES API credentials have been verified and saved.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Email Not Verified",
          description: `Your sender email is not verified in AWS SES. Status: ${result.verificationStatus}`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Save",
        description: error.message,
      });
    },
  });

  const saveSmtpMutation = useMutation({
    mutationFn: api.settings.saveSESSMTP,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ses-settings"] });
      toast({
        title: "Settings Saved",
        description: "Your AWS SES SMTP credentials have been verified and saved.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Save",
        description: error.message,
      });
    },
  });

  const handleApiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveApiMutation.mutate({
      accessKeyId,
      secretAccessKey,
      region,
      fromEmail,
      fromName,
    });
  };

  const handleSmtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSmtpMutation.mutate({
      smtpHost,
      smtpPort: parseInt(smtpPort, 10),
      smtpUser,
      smtpPassword,
      fromEmail,
      fromName,
    });
  };

  const currentProtocol = sesSettings?.protocol || 'api';
  const isAdmin = user?.role === 'admin';

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-4xl mx-auto space-y-8">
          
          <div>
            <h2 className="text-3xl font-bold tracking-tight font-display">Settings</h2>
            <p className="text-muted-foreground mt-1">
              Manage your account, users, and email configuration.
            </p>
          </div>

          <Dialog open={!!showCreatedUserInfo} onOpenChange={() => setShowCreatedUserInfo(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>User Created Successfully</DialogTitle>
                <DialogDescription>
                  {showCreatedUserInfo?.emailSent 
                    ? "The user has been created and a welcome email has been sent."
                    : "The user has been created. Please share the login credentials with them."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <p className="font-mono">{showCreatedUserInfo?.email}</p>
                  </div>
                  {showCreatedUserInfo?.password && (
                    <div>
                      <span className="text-sm text-muted-foreground">Password:</span>
                      <div className="flex items-center gap-2">
                        <code className="bg-background px-2 py-1 rounded border font-mono text-sm flex-1">
                          {showCreatedUserInfo.password}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(showCreatedUserInfo.password!);
                            toast({
                              title: "Copied!",
                              description: "Password copied to clipboard.",
                            });
                          }}
                          data-testid="button-copy-password"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {showCreatedUserInfo?.emailSent && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Welcome email sent successfully
                  </div>
                )}
                {showCreatedUserInfo?.emailError && (
                  <div className="flex items-start gap-2 text-amber-600 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5" />
                    <span>Email not sent: {showCreatedUserInfo.emailError}</span>
                  </div>
                )}
                {showCreatedUserInfo?.password && (
                  <p className="text-sm text-muted-foreground">
                    Please save this password securely. The user should change it after their first login.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setShowCreatedUserInfo(null)} data-testid="button-close-password-dialog">
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border-none shadow-sm">
            <Tabs defaultValue="account" className="w-full">
              <CardHeader className="pb-0">
                <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  <TabsTrigger value="account" className="gap-2" data-testid="tab-account">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">Account</span>
                  </TabsTrigger>
                  {isAdmin && (
                    <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">Users</span>
                    </TabsTrigger>
                  )}
                  {isAdmin && (
                    <TabsTrigger value="ses" className="gap-2" data-testid="tab-ses">
                      <Cloud className="w-4 h-4" />
                      <span className="hidden sm:inline">SES Configuration</span>
                    </TabsTrigger>
                  )}
                </TabsList>
              </CardHeader>

              {/* Account Tab */}
              <TabsContent value="account" className="mt-0">
                <CardHeader className="pt-6">
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>Your account information and security settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{user?.name}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                      <div className="mt-1">{user?.role && getRoleBadge(user.role as UserRole)}</div>
                    </div>
                    <Button variant="outline" onClick={logout} className="gap-2" data-testid="button-logout">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </Button>
                  </div>
                  
                  <div className="border-t pt-6">
                    <h4 className="font-medium mb-4">Change Password</h4>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="currentPassword">Current Password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            data-testid="input-current-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="newPassword">New Password</Label>
                          <Input
                            id="newPassword"
                            type="password"
                            placeholder="Minimum 6 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            data-testid="input-new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            data-testid="input-confirm-password"
                          />
                        </div>
                      </div>
                      <Button type="submit" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
                        {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Change Password
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </TabsContent>

              {/* Users Tab (Admin Only) */}
              {isAdmin && (
                <TabsContent value="users" className="mt-0">
                  <CardHeader className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>User Management</CardTitle>
                        <CardDescription>Manage user accounts and their access levels.</CardDescription>
                      </div>
                      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-2" data-testid="button-add-user">
                            <Plus className="w-4 h-4" />
                            Add User
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New User</DialogTitle>
                            <DialogDescription>
                              Add a new user to the system. They will receive access based on their assigned role.
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="newUserName">Name</Label>
                              <Input
                                id="newUserName"
                                placeholder="John Doe"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                required
                                data-testid="input-new-user-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="newUserEmail">Email</Label>
                              <Input
                                id="newUserEmail"
                                type="email"
                                placeholder="john@example.com"
                                value={newUserEmail}
                                onChange={(e) => setNewUserEmail(e.target.value)}
                                required
                                data-testid="input-new-user-email"
                              />
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="autoGeneratePassword"
                                  checked={autoGeneratePassword}
                                  onChange={(e) => setAutoGeneratePassword(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  data-testid="checkbox-auto-generate-password"
                                />
                                <Label htmlFor="autoGeneratePassword" className="text-sm font-normal cursor-pointer">
                                  Auto-generate password
                                </Label>
                              </div>
                              {!autoGeneratePassword && (
                                <div className="space-y-2">
                                  <Label htmlFor="newUserPassword">Password</Label>
                                  <Input
                                    id="newUserPassword"
                                    type="password"
                                    placeholder="Minimum 6 characters"
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    data-testid="input-new-user-password"
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="sendWelcomeEmail"
                                  checked={sendWelcomeEmail}
                                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  data-testid="checkbox-send-welcome-email"
                                />
                                <Label htmlFor="sendWelcomeEmail" className="text-sm font-normal cursor-pointer">
                                  Send welcome email with login credentials
                                </Label>
                              </div>
                              {sendWelcomeEmail && !sesSettings?.isVerified && (
                                <p className="text-xs text-amber-600">
                                  Note: Welcome email requires verified SES credentials in Settings.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="newUserRole">Role</Label>
                              <Select value={newUserRole} onValueChange={(v: UserRole) => setNewUserRole(v)}>
                                <SelectTrigger data-testid="select-new-user-role">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">
                                    <div className="flex items-center gap-2">
                                      <Shield className="w-4 h-4 text-red-600" />
                                      Admin - Full access to all features
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="associate">
                                    <div className="flex items-center gap-2">
                                      <Users className="w-4 h-4 text-blue-600" />
                                      Associate - Can manage campaigns
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="analyst">
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 text-green-600" />
                                      Analyst - View-only access
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <DialogFooter>
                              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>
                                Cancel
                              </Button>
                              <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-create-user">
                                {createUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create User
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingUsers ? (
                      <div className="py-10 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {usersList?.map((u) => (
                          <div 
                            key={u.id} 
                            className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                            data-testid={`user-row-${u.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{u.name}</p>
                                  {getRoleBadge(u.role as UserRole)}
                                  {u.isOwner && (
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">Owner</Badge>
                                  )}
                                  {u.id === user?.id && (
                                    <Badge variant="outline" className="text-xs">You</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {u.id !== user?.id && !u.isOwner && (
                                <>
                                  <Select 
                                    value={u.role} 
                                    onValueChange={(role: UserRole) => updateRoleMutation.mutate({ userId: u.id, role })}
                                    disabled={updateRoleMutation.isPending}
                                  >
                                    <SelectTrigger 
                                      className="w-32 h-8 text-sm"
                                      data-testid={`select-role-${u.id}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">
                                        <div className="flex items-center gap-2">
                                          <Shield className="w-3 h-3 text-red-600" />
                                          Admin
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="associate">
                                        <div className="flex items-center gap-2">
                                          <Users className="w-3 h-3 text-blue-600" />
                                          Associate
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="analyst">
                                        <div className="flex items-center gap-2">
                                          <User className="w-3 h-3 text-green-600" />
                                          Analyst
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="text-destructive hover:text-destructive"
                                        data-testid={`button-delete-user-${u.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete {u.name}? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction 
                                          onClick={() => deleteUserMutation.mutate(u.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                        {usersList?.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No users found. Add your first user to get started.
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>
              )}

              {/* SES Configuration Tab (Admin Only) */}
              {isAdmin && <TabsContent value="ses" className="mt-0">
                <CardHeader className="pt-6">
                  <div className="flex items-center gap-2">
                    <CardTitle>AWS SES Configuration</CardTitle>
                    {sesSettings?.isVerified && (
                      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Verified ({currentProtocol.toUpperCase()})
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Connect your AWS SES account and configure bounce notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {loadingSettings ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Credentials Section */}
                      <div>
                        <h4 className="font-medium mb-4 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Email Credentials
                        </h4>
                        <Tabs defaultValue={currentProtocol} className="space-y-6">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="api" className="gap-2">
                              <Mail className="w-4 h-4" />
                              API Mode
                            </TabsTrigger>
                            <TabsTrigger value="smtp" className="gap-2">
                              <Server className="w-4 h-4" />
                              SMTP Mode
                            </TabsTrigger>
                          </TabsList>

                          {/* API Mode */}
                          <TabsContent value="api">
                            <form onSubmit={handleApiSubmit} className="space-y-6">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="accessKeyId">Access Key ID</Label>
                                  <Input
                                    id="accessKeyId"
                                    placeholder={sesSettings?.protocol === 'api' && sesSettings?.accessKeyId ? sesSettings.accessKeyId : "AKIA..."}
                                    value={accessKeyId}
                                    onChange={(e) => setAccessKeyId(e.target.value)}
                                    required
                                    data-testid="input-access-key"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="secretAccessKey">Secret Access Key</Label>
                                  <Input
                                    id="secretAccessKey"
                                    type="password"
                                    placeholder="Enter secret key"
                                    value={secretAccessKey}
                                    onChange={(e) => setSecretAccessKey(e.target.value)}
                                    required
                                    data-testid="input-secret-key"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="region">AWS Region</Label>
                                <Select value={region} onValueChange={setRegion}>
                                  <SelectTrigger data-testid="select-region">
                                    <SelectValue placeholder="Select region" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {AWS_REGIONS.map((r) => (
                                      <SelectItem key={r.value} value={r.value}>
                                        {r.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="fromNameApi">From Name</Label>
                                  <Input
                                    id="fromNameApi"
                                    placeholder="Your Company"
                                    value={fromName}
                                    onChange={(e) => setFromName(e.target.value)}
                                    required
                                    data-testid="input-from-name"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="fromEmailApi">From Email</Label>
                                  <Input
                                    id="fromEmailApi"
                                    type="email"
                                    placeholder="noreply@yourdomain.com"
                                    value={fromEmail}
                                    onChange={(e) => setFromEmail(e.target.value)}
                                    required
                                    data-testid="input-from-email"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    This email must be verified in AWS SES
                                  </p>
                                </div>
                              </div>

                              <Button type="submit" disabled={saveApiMutation.isPending} data-testid="button-save-api">
                                {saveApiMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save API Settings
                              </Button>
                            </form>
                          </TabsContent>

                          {/* SMTP Mode */}
                          <TabsContent value="smtp">
                            <form onSubmit={handleSmtpSubmit} className="space-y-6">
                              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                                <p className="font-medium mb-1">SMTP Configuration</p>
                                <p>Use your AWS SES SMTP credentials. Find them in the AWS SES console under "SMTP settings".</p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="smtpHost">SMTP Host</Label>
                                  <Input
                                    id="smtpHost"
                                    placeholder={sesSettings?.protocol === 'smtp' && sesSettings?.smtpHost ? sesSettings.smtpHost : "email-smtp.us-east-1.amazonaws.com"}
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    required
                                    data-testid="input-smtp-host"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="smtpPort">SMTP Port</Label>
                                  <Select value={smtpPort} onValueChange={setSmtpPort}>
                                    <SelectTrigger data-testid="select-smtp-port">
                                      <SelectValue placeholder="Select port" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="25">25 (SMTP)</SelectItem>
                                      <SelectItem value="465">465 (SMTPS)</SelectItem>
                                      <SelectItem value="587">587 (STARTTLS)</SelectItem>
                                      <SelectItem value="2465">2465 (SMTPS)</SelectItem>
                                      <SelectItem value="2587">2587 (STARTTLS)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="smtpUser">SMTP Username</Label>
                                  <Input
                                    id="smtpUser"
                                    placeholder={sesSettings?.protocol === 'smtp' && sesSettings?.smtpUser ? sesSettings.smtpUser : "AKIA..."}
                                    value={smtpUser}
                                    onChange={(e) => setSmtpUser(e.target.value)}
                                    required
                                    data-testid="input-smtp-user"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="smtpPassword">SMTP Password</Label>
                                  <Input
                                    id="smtpPassword"
                                    type="password"
                                    placeholder="Enter SMTP password"
                                    value={smtpPassword}
                                    onChange={(e) => setSmtpPassword(e.target.value)}
                                    required
                                    data-testid="input-smtp-password"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="fromNameSmtp">From Name</Label>
                                  <Input
                                    id="fromNameSmtp"
                                    placeholder="Your Company"
                                    value={fromName}
                                    onChange={(e) => setFromName(e.target.value)}
                                    required
                                    data-testid="input-from-name-smtp"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="fromEmailSmtp">From Email</Label>
                                  <Input
                                    id="fromEmailSmtp"
                                    type="email"
                                    placeholder="noreply@yourdomain.com"
                                    value={fromEmail}
                                    onChange={(e) => setFromEmail(e.target.value)}
                                    required
                                    data-testid="input-from-email-smtp"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    This email must be verified in AWS SES
                                  </p>
                                </div>
                              </div>

                              {sesSettings && !sesSettings.isVerified && (
                                <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
                                  <AlertCircle className="w-4 h-4" />
                                  Your sender email is not verified in AWS SES. Please verify it in the AWS console.
                                </div>
                              )}

                              <Button type="submit" disabled={saveSmtpMutation.isPending} data-testid="button-save-smtp">
                                {saveSmtpMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save SMTP Settings
                              </Button>
                            </form>
                          </TabsContent>
                        </Tabs>
                      </div>

                      {/* Bounce Notifications Section */}
                      <div className="border-t pt-6">
                        <h4 className="font-medium mb-4 flex items-center gap-2">
                          <Webhook className="w-4 h-4" />
                          Bounce & Complaint Notifications
                        </h4>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Webhook URL</Label>
                            <div className="flex gap-2">
                              <Input 
                                value={webhookInfo?.webhookUrl || ''} 
                                readOnly 
                                className="bg-muted/50 font-mono text-sm"
                                data-testid="input-webhook-url"
                              />
                              <Button variant="outline" onClick={copyWebhookUrl} data-testid="button-copy-webhook">
                                <Copy className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Use this URL when creating an SNS subscription for SES notifications.
                            </p>
                          </div>

                          <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                            <p className="font-medium text-sm">Setup Instructions:</p>
                            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                              {webhookInfo?.instructions?.map((instruction, i) => (
                                <li key={i}>{instruction}</li>
                              ))}
                            </ol>
                          </div>

                          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>The webhook will automatically confirm SNS subscriptions and update subscriber status when bounces or complaints are received.</span>
                          </div>
                        </div>
                      </div>

                      {/* Sender Identities Section */}
                      <div className="border-t pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            Sender Email Addresses
                          </h4>
                          <Dialog open={showAddSender} onOpenChange={setShowAddSender}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1" data-testid="button-add-sender">
                                <Plus className="w-4 h-4" />
                                Add Sender
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Sender Email Address</DialogTitle>
                                <DialogDescription>
                                  Add a new sender email address. The email must be verified in AWS SES to use in campaigns.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <p className="text-sm font-medium text-blue-900">How to Verify Your Email in AWS SES:</p>
                                <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                                  <li>Log in to your AWS Management Console</li>
                                  <li>Go to SES (Simple Email Service)</li>
                                  <li>Select your region ({sesSettings?.region || 'us-east-1'})</li>
                                  <li>Click "Verified Identities" → "Create Identity"</li>
                                  <li>Choose "Email Address" and enter your sender email</li>
                                  <li>AWS will send a verification email - click the confirmation link</li>
                                  <li>Then add the sender email address here</li>
                                </ol>
                              </div>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="senderEmail">Email Address</Label>
                                  <Input
                                    id="senderEmail"
                                    type="email"
                                    placeholder="noreply@yourdomain.com"
                                    value={newSenderEmail}
                                    onChange={(e) => setNewSenderEmail(e.target.value)}
                                    data-testid="input-sender-email"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="senderName">Display Name</Label>
                                  <Input
                                    id="senderName"
                                    placeholder="Your Company Name"
                                    value={newSenderName}
                                    onChange={(e) => setNewSenderName(e.target.value)}
                                    data-testid="input-sender-name"
                                  />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    id="isDefault"
                                    checked={newSenderIsDefault}
                                    onChange={(e) => setNewSenderIsDefault(e.target.checked)}
                                    className="rounded border-gray-300"
                                    data-testid="checkbox-sender-default"
                                  />
                                  <Label htmlFor="isDefault" className="text-sm font-normal">
                                    Set as default sender
                                  </Label>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setShowAddSender(false)}>
                                  Cancel
                                </Button>
                                <Button 
                                  onClick={() => createSenderMutation.mutate({ 
                                    email: newSenderEmail, 
                                    name: newSenderName,
                                    isDefault: newSenderIsDefault 
                                  })}
                                  disabled={createSenderMutation.isPending || !newSenderEmail || !newSenderName}
                                  data-testid="button-save-sender"
                                >
                                  {createSenderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                  Add Sender
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        <p className="text-sm text-muted-foreground mb-4">
                          Configure multiple sender email addresses for your campaigns. Each email must be verified in AWS SES.
                        </p>

                        {loadingSenders ? (
                          <div className="py-4 flex justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : senderIdentities.length === 0 ? (
                          <div className="text-center py-8 border rounded-lg bg-muted/20">
                            <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">No sender email addresses configured.</p>
                            <p className="text-sm text-muted-foreground">Add a sender to use in your campaigns.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {senderIdentities.map((sender) => (
                              <div key={sender.id}>
                                <div className={`flex items-center justify-between p-3 border rounded-lg ${sender.isActive === false ? 'opacity-60 bg-muted/30' : ''}`} data-testid={`sender-row-${sender.id}`}>
                                  <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium">{sender.name}</span>
                                        {sender.isDefault && (
                                          <Badge variant="secondary" className="text-xs">Default</Badge>
                                        )}
                                        {sender.isActive === false && (
                                          <Badge variant="outline" className="text-gray-600 border-gray-300 bg-gray-100 text-xs gap-1">
                                            <PowerOff className="w-3 h-3" />
                                            Inactive
                                          </Badge>
                                        )}
                                        {sender.isVerified ? (
                                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            Verified
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 text-xs gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            Unverified
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-sm text-muted-foreground">{sender.email}</span>
                                      {!sender.isVerified && (
                                        <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                                          Verify this email in AWS SES before using in campaigns. Go to AWS Console → SES → Verified Identities → Create Identity → verify the email address.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                <div className="flex items-center gap-2">
                                  {!sender.isDefault && sender.isActive !== false && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => setDefaultSenderMutation.mutate({ id: sender.id })}
                                      disabled={setDefaultSenderMutation.isPending}
                                      data-testid={`button-set-default-${sender.id}`}
                                    >
                                      Set as Default
                                    </Button>
                                  )}
                                  {sender.isActive === false ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => activateSenderMutation.mutate(sender.id)}
                                      disabled={activateSenderMutation.isPending}
                                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                      data-testid={`button-activate-sender-${sender.id}`}
                                    >
                                      <Power className="w-4 h-4 mr-1" />
                                      Activate
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deactivateSenderMutation.mutate(sender.id)}
                                      disabled={deactivateSenderMutation.isPending || sender.isDefault}
                                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                      data-testid={`button-deactivate-sender-${sender.id}`}
                                      title={sender.isDefault ? "Cannot deactivate default sender" : "Deactivate sender"}
                                    >
                                      <PowerOff className="w-4 h-4 mr-1" />
                                      Deactivate
                                    </Button>
                                  )}
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid={`button-delete-sender-${sender.id}`}>
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remove Sender Email?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to remove "{sender.email}"? Existing campaigns using this sender will not be affected.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteSenderMutation.mutate(sender.id)}
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          Remove
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </TabsContent>}
            </Tabs>
          </Card>

        </div>
      </div>
    </div>
  );
}
