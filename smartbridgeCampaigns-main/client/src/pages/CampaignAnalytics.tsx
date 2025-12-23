import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistance } from "date-fns";
import { ChevronLeft, Send, MailCheck, Eye, MousePointerClick, AlertTriangle, XCircle, Loader2, TrendingUp, TrendingDown, Users, Search, ChevronLeftIcon, ChevronRightIcon, User, Clock, PlayCircle, CheckCircle2, TestTube2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";

function StatCard({ title, value, subtitle, icon: Icon, color = "primary" }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: "primary" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    primary: "text-primary bg-primary/10",
    green: "text-green-600 bg-green-100",
    yellow: "text-yellow-600 bg-yellow-100",
    red: "text-red-600 bg-red-100",
  };

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold font-display">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RateBar({ label, value, total, color = "primary" }: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

export default function CampaignAnalytics() {
  const params = useParams();
  const campaignId = params.id;
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.campaigns.get(campaignId!),
    enabled: !!campaignId,
  });

  const { data: recipientsData, isLoading: isLoadingRecipients } = useQuery({
    queryKey: ["campaign-recipients", campaignId],
    queryFn: () => api.campaigns.getRecipients(campaignId!),
    enabled: !!campaignId && (campaign?.status === "completed" || campaign?.status === "sending"),
  });

  const { data: testEmailLogs } = useQuery({
    queryKey: ["campaign-test-logs", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/test-logs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch test email logs');
      return res.json() as Promise<Array<{
        id: string;
        recipientEmail: string;
        senderEmail: string;
        senderName?: string;
        subject: string;
        status: string;
        sentAt: string;
        senderUserName?: string;
        errorMessage?: string;
      }>>;
    },
    enabled: !!campaignId,
  });

  const filteredRecipients = useMemo(() => {
    if (!recipientsData?.recipients) return [];
    
    return recipientsData.recipients.filter(r => {
      const matchesSearch = r.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [recipientsData?.recipients, searchQuery, statusFilter]);

  const paginatedRecipients = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecipients.slice(start, start + pageSize);
  }, [filteredRecipients, page]);

  const totalPages = Math.ceil(filteredRecipients.length / pageSize);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 pl-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 pl-64 flex items-center justify-center">
          <p className="text-muted-foreground">Campaign not found</p>
        </div>
      </div>
    );
  }

  const openRate = campaign.totalDelivered > 0 
    ? ((campaign.totalOpened / campaign.totalDelivered) * 100).toFixed(1) 
    : "0";
  const clickRate = campaign.totalOpened > 0 
    ? ((campaign.totalClicked / campaign.totalOpened) * 100).toFixed(1) 
    : "0";
  const bounceRate = campaign.totalSent > 0 
    ? ((campaign.totalBounced / campaign.totalSent) * 100).toFixed(1) 
    : "0";
  const deliveryRate = campaign.totalSent > 0 
    ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1) 
    : "0";

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-6xl mx-auto space-y-8">
          
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/campaigns">
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight font-display">{campaign.name}</h2>
                <Badge 
                  variant={campaign.status === 'completed' ? 'default' : 'outline'}
                  className="capitalize"
                >
                  {campaign.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <span>
                  {campaign.sentAt 
                    ? `Sent on ${format(new Date(campaign.sentAt), 'MMMM d, yyyy at h:mm a')}`
                    : `Created ${format(new Date(campaign.createdAt), 'MMMM d, yyyy')}`
                  }
                </span>
                {(campaign as any).creatorName && (
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {(campaign as any).creatorName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Campaign Timing Info */}
          {campaign.status === 'completed' && (campaign as any).jobStartedAt && (
            <Card className="border-none shadow-sm bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="text-xs text-muted-foreground">Started</p>
                        <p className="font-medium text-sm">
                          {format(new Date((campaign as any).jobStartedAt), 'MMM d, yyyy h:mm:ss a')}
                        </p>
                      </div>
                    </div>
                    {(campaign as any).jobFinishedAt && (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="text-xs text-muted-foreground">Completed</p>
                            <p className="font-medium text-sm">
                              {format(new Date((campaign as any).jobFinishedAt), 'MMM d, yyyy h:mm:ss a')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="font-medium text-sm">
                              {(() => {
                                const start = new Date((campaign as any).jobStartedAt).getTime();
                                const end = new Date((campaign as any).jobFinishedAt).getTime();
                                const durationMs = end - start;
                                const seconds = Math.floor(durationMs / 1000);
                                const minutes = Math.floor(seconds / 60);
                                const hours = Math.floor(minutes / 60);
                                if (hours > 0) {
                                  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
                                } else if (minutes > 0) {
                                  return `${minutes}m ${seconds % 60}s`;
                                } else {
                                  return `${seconds}s`;
                                }
                              })()}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Sending Speed</p>
                    <p className="font-medium text-sm">
                      {(() => {
                        if (!(campaign as any).jobFinishedAt) return '-';
                        const start = new Date((campaign as any).jobStartedAt).getTime();
                        const end = new Date((campaign as any).jobFinishedAt).getTime();
                        const durationSec = (end - start) / 1000;
                        if (durationSec === 0) return '-';
                        const emailsPerSec = (campaign.totalSent / durationSec).toFixed(1);
                        return `${emailsPerSec} emails/sec`;
                      })()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Sent"
              value={campaign.totalSent.toLocaleString()}
              subtitle={`${deliveryRate}% delivered`}
              icon={Send}
              color="primary"
            />
            <StatCard
              title="Opened"
              value={campaign.totalOpened.toLocaleString()}
              subtitle={`${openRate}% open rate`}
              icon={Eye}
              color="green"
            />
            <StatCard
              title="Clicked"
              value={campaign.totalClicked.toLocaleString()}
              subtitle={`${clickRate}% click rate`}
              icon={MousePointerClick}
              color="green"
            />
            <StatCard
              title="Bounced"
              value={campaign.totalBounced.toLocaleString()}
              subtitle={`${bounceRate}% bounce rate`}
              icon={AlertTriangle}
              color={campaign.totalBounced > 0 ? "red" : "primary"}
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Delivery Funnel */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Delivery Funnel</CardTitle>
                <CardDescription>How your email performed at each stage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RateBar 
                  label="Delivered" 
                  value={campaign.totalDelivered} 
                  total={campaign.totalSent} 
                />
                <RateBar 
                  label="Opened" 
                  value={campaign.totalOpened} 
                  total={campaign.totalDelivered} 
                />
                <RateBar 
                  label="Clicked" 
                  value={campaign.totalClicked} 
                  total={campaign.totalOpened} 
                />
              </CardContent>
            </Card>

            {/* Performance Summary */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Detailed breakdown of campaign metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <MailCheck className="w-4 h-4 text-green-600" />
                    <span>Successfully Delivered</span>
                  </div>
                  <span className="font-medium">{campaign.totalDelivered.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600" />
                    <span>Unique Opens</span>
                  </div>
                  <span className="font-medium">{campaign.totalOpened.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="w-4 h-4 text-purple-600" />
                    <span>Unique Clicks</span>
                  </div>
                  <span className="font-medium">{campaign.totalClicked.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span>Bounced</span>
                  </div>
                  <span className="font-medium text-yellow-600">{campaign.totalBounced.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>Complaints</span>
                  </div>
                  <span className="font-medium text-red-600">{campaign.totalComplaints.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rate Indicators */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Key Rate Indicators</CardTitle>
              <CardDescription>Industry benchmarks: Open Rate 15-25%, Click Rate 2-5%, Bounce Rate &lt;2%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="text-center p-6 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {Number(openRate) >= 20 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : Number(openRate) >= 15 ? (
                      <TrendingUp className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm text-muted-foreground">Open Rate</span>
                  </div>
                  <p className="text-3xl font-bold font-display">{openRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Number(openRate) >= 20 ? "Excellent" : Number(openRate) >= 15 ? "Good" : "Needs improvement"}
                  </p>
                </div>
                <div className="text-center p-6 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {Number(clickRate) >= 5 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : Number(clickRate) >= 2 ? (
                      <TrendingUp className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm text-muted-foreground">Click Rate</span>
                  </div>
                  <p className="text-3xl font-bold font-display">{clickRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Number(clickRate) >= 5 ? "Excellent" : Number(clickRate) >= 2 ? "Good" : "Needs improvement"}
                  </p>
                </div>
                <div className="text-center p-6 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {Number(bounceRate) < 2 ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : Number(bounceRate) < 5 ? (
                      <TrendingDown className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm text-muted-foreground">Bounce Rate</span>
                  </div>
                  <p className="text-3xl font-bold font-display">{bounceRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Number(bounceRate) < 2 ? "Healthy" : Number(bounceRate) < 5 ? "Moderate" : "High - clean your list"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Email Logs */}
          {testEmailLogs && testEmailLogs.length > 0 && (
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TestTube2 className="w-5 h-5" />
                  Test Email Logs
                </CardTitle>
                <CardDescription>
                  {testEmailLogs.length} test email{testEmailLogs.length > 1 ? 's' : ''} sent for this campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {testEmailLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.recipientEmail}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {log.senderName ? `${log.senderName} <${log.senderEmail}>` : log.senderEmail}
                          </span>
                        </TableCell>
                        <TableCell>
                          {log.senderUserName || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                            {log.status}
                          </Badge>
                          {log.errorMessage && (
                            <p className="text-xs text-red-500 mt-1">{log.errorMessage}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(log.sentAt), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Campaign Details */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Subject Line</p>
                  <p className="font-medium">{campaign.subject}</p>
                </div>
                {campaign.htmlContent && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Email Preview</p>
                    <div className="border rounded-lg p-4 bg-white max-h-64 overflow-auto">
                      <div dangerouslySetInnerHTML={{ __html: campaign.htmlContent }} />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recipients List */}
          {(campaign.status === "completed" || campaign.status === "sending") && (
            <Card className="border-none shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Recipients
                    </CardTitle>
                    <CardDescription>
                      {recipientsData?.total || 0} people received this campaign
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                      data-testid="input-search-recipients"
                    />
                  </div>
                  <Select 
                    value={statusFilter} 
                    onValueChange={(value) => {
                      setStatusFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="opened">Opened</SelectItem>
                      <SelectItem value="clicked">Clicked</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isLoadingRecipients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedRecipients.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery || statusFilter !== "all" 
                      ? "No recipients match your search criteria" 
                      : "No recipients found"}
                  </div>
                ) : (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Sent</TableHead>
                            <TableHead>Opened</TableHead>
                            <TableHead>Clicked</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedRecipients.map((recipient) => (
                            <TableRow key={recipient.id} data-testid={`row-recipient-${recipient.id}`}>
                              <TableCell className="font-medium">{recipient.email}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    recipient.status === "bounced" || recipient.status === "failed"
                                      ? "destructive"
                                      : recipient.status === "clicked" || recipient.status === "opened"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="capitalize"
                                >
                                  {recipient.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {recipient.sentAt 
                                  ? format(new Date(recipient.sentAt), "MMM d, h:mm a")
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {recipient.openedAt 
                                  ? format(new Date(recipient.openedAt), "MMM d, h:mm a")
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {recipient.clickedAt 
                                  ? format(new Date(recipient.clickedAt), "MMM d, h:mm a")
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredRecipients.length)} of {filteredRecipients.length} recipients
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeftIcon className="w-4 h-4" />
                          </Button>
                          <span className="text-sm">
                            Page {page} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            data-testid="button-next-page"
                          >
                            <ChevronRightIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
