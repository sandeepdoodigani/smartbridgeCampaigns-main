import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Plus, MailCheck, Eye, MousePointerClick, AlertCircle, TrendingUp, TrendingDown, Loader2, Users } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

function StatsCard({ title, value, change, trend, icon: Icon, description }: {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card className="border-none shadow-sm bg-card hover:shadow-md transition-all duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display">{value}</div>
        {(change || description) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {change && (
              <span className={trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : ''}>
                {trend === 'up' && <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                {change}
              </span>
            )}
            {description && <span className="opacity-80">{description}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: analytics, isLoading: loadingAnalytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: api.analytics.get,
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.campaigns.getAll,
  });

  const { data: sesSettings } = useQuery({
    queryKey: ["ses-settings"],
    queryFn: api.settings.getSES,
  });

  const isLoading = loadingAnalytics || loadingCampaigns;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight font-display">Dashboard</h2>
              <p className="text-muted-foreground mt-1">
                Welcome back. Here's what's happening with your campaigns.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild className="gap-2 shadow-lg shadow-primary/20" data-testid="button-create-campaign">
                <Link href="/campaigns/new">
                  <Plus className="w-4 h-4" />
                  Create Campaign
                </Link>
              </Button>
            </div>
          </div>

          {/* SES Warning */}
          {!sesSettings && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="py-4 flex items-center gap-4">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-800">AWS SES Not Configured</p>
                  <p className="text-sm text-yellow-700">Configure your AWS SES credentials in Settings to start sending emails.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">Configure</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatsCard
                title="Total Subscribers"
                value={analytics?.totalSubscribers?.toLocaleString() || 0}
                icon={Users}
                description={`${analytics?.activeSubscribers || 0} active`}
              />
              <StatsCard
                title="Emails Sent"
                value={analytics?.totalSent?.toLocaleString() || 0}
                icon={MailCheck}
              />
              <StatsCard
                title="Open Rate"
                value={`${analytics?.openRate || 0}%`}
                icon={Eye}
                trend={Number(analytics?.openRate) > 20 ? 'up' : 'neutral'}
              />
              <StatsCard
                title="Click Rate"
                value={`${analytics?.clickRate || 0}%`}
                icon={MousePointerClick}
                trend={Number(analytics?.clickRate) > 5 ? 'up' : 'neutral'}
              />
            </div>
          )}

          {/* Recent Campaigns */}
          <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Recent Campaigns</CardTitle>
                <CardDescription>Your latest email campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCampaigns ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : campaigns.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <MailCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">No campaigns yet. Create your first one!</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {campaigns.slice(0, 5).map((campaign) => (
                      <div key={campaign.id} className="flex items-center gap-4" data-testid={`campaign-${campaign.id}`}>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {campaign.status === 'completed' && campaign.sentAt
                              ? `Sent ${format(new Date(campaign.sentAt), 'MMM d, h:mm a')}`
                              : campaign.status === 'scheduled' && campaign.scheduledFor
                              ? `Scheduled ${format(new Date(campaign.scheduledFor), 'MMM d')}`
                              : campaign.status
                            }
                          </p>
                        </div>
                        <Badge 
                          variant={
                            campaign.status === 'completed' ? 'default' : 
                            campaign.status === 'sending' ? 'secondary' : 
                            'outline'
                          }
                          className="text-xs font-normal capitalize"
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="ghost" className="w-full mt-6 text-xs" asChild>
                  <Link href="/campaigns">View all campaigns</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Overview of your email performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Campaigns</span>
                    <span className="font-medium">{analytics?.totalCampaigns || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Completed</span>
                    <span className="font-medium">{analytics?.completedCampaigns || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Delivered</span>
                    <span className="font-medium">{analytics?.totalDelivered?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Opened</span>
                    <span className="font-medium">{analytics?.totalOpened?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Clicked</span>
                    <span className="font-medium">{analytics?.totalClicked?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Bounced</span>
                    <span className="font-medium text-red-500">{analytics?.totalBounced?.toLocaleString() || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
