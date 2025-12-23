import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Campaign } from "@shared/schema";
import { format } from "date-fns";
import { Search, Filter, MoreHorizontal, Loader2, Mail, BarChart3, Send, Trash2, Pause, FileEdit, Calendar, X, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

interface CampaignWithCreator extends Campaign {
  creatorName: string;
}

interface JobStatus {
  hasJob: boolean;
  jobId?: string;
  status?: string;
  progress?: number;
  totalRecipients?: number;
  processedCount?: number;
  sentCount?: number;
  failedCount?: number;
  currentBatch?: number;
  totalBatches?: number;
  isActive?: boolean;
  startedAt?: string;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.ceil((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function calculateETA(jobStatus: JobStatus): { eta: string | null; rate: number | null } {
  if (!jobStatus.startedAt || !jobStatus.processedCount || jobStatus.processedCount <= 0) {
    return { eta: null, rate: null };
  }
  
  const startTime = new Date(jobStatus.startedAt).getTime();
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  
  if (elapsed < 3) return { eta: null, rate: null }; // Wait for stable rate
  
  const rate = jobStatus.processedCount / elapsed; // emails per second
  const remaining = (jobStatus.totalRecipients || 0) - jobStatus.processedCount;
  const estimatedRemaining = remaining / rate;
  
  return {
    eta: remaining > 0 ? formatTimeRemaining(estimatedRemaining) : null,
    rate: Math.round(rate * 10) / 10,
  };
}

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({});
  const { user, isAdmin, canManageCampaigns } = useAuth();

  const { data: campaigns = [], isLoading } = useQuery<CampaignWithCreator[]>({
    queryKey: ["campaigns"],
    queryFn: api.campaigns.getAll as () => Promise<CampaignWithCreator[]>,
    refetchInterval: 5000,
  });

  const canEditCampaign = (campaign: CampaignWithCreator) => {
    if (!user) return false;
    return isAdmin || campaign.userId === user.id;
  };

  const sendingCampaigns = campaigns.filter(c => c.status === 'sending');

  useEffect(() => {
    if (sendingCampaigns.length === 0) return;

    const pollJobs = async () => {
      const statuses: Record<string, JobStatus> = {};
      for (const campaign of sendingCampaigns) {
        try {
          const status = await api.campaigns.getJobStatus(campaign.id);
          statuses[campaign.id] = status;
          
          if (status.hasJob && status.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }
        } catch (err) {
          console.error(`Failed to get job status for ${campaign.id}:`, err);
        }
      }
      setJobStatuses(statuses);
    };

    pollJobs();
    const interval = setInterval(pollJobs, 2000);
    return () => clearInterval(interval);
  }, [sendingCampaigns.map(c => c.id).join(','), queryClient]);

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.campaigns.send(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({
        title: "Campaign Queued",
        description: result.message,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Send Failed",
        description: error.message,
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: api.campaigns.pause,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({
        title: "Campaign Paused",
        description: result.message,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Pause Failed",
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.campaigns.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign deleted" });
    },
  });

  const unscheduleMutation = useMutation({
    mutationFn: api.campaigns.unschedule,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({
        title: "Campaign Unscheduled",
        description: result.message,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Unschedule Failed",
        description: error.message,
      });
    },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight font-display">Campaigns</h2>
              <p className="text-muted-foreground mt-1">
                Manage and monitor your email campaigns.
              </p>
            </div>
            {canManageCampaigns && (
              <Button asChild className="shadow-lg shadow-primary/20" data-testid="button-new-campaign">
                <Link href="/campaigns/new">New Campaign</Link>
              </Button>
            )}
          </div>

          <Card className="border-none shadow-sm">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search campaigns..." className="pl-9 bg-background border-none ring-offset-0 focus-visible:ring-0" data-testid="input-search-campaigns" />
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
                </Button>
              </div>
              
              {isLoading ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Mail className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm">No campaigns yet. Create your first campaign to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="w-[280px]">Campaign</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Open Rate</TableHead>
                      <TableHead className="text-right">Click Rate</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => {
                      const openRate = campaign.totalDelivered > 0 
                        ? ((campaign.totalOpened / campaign.totalDelivered) * 100).toFixed(1) + '%' 
                        : '-';
                      const clickRate = campaign.totalOpened > 0 
                        ? ((campaign.totalClicked / campaign.totalOpened) * 100).toFixed(1) + '%' 
                        : '-';
                      const jobStatus = jobStatuses[campaign.id];
                      const isSending = campaign.status === 'sending' && jobStatus?.hasJob;

                      return (
                        <TableRow key={campaign.id} className="group hover:bg-muted/50 border-border" data-testid={`row-campaign-${campaign.id}`}>
                          <TableCell>
                            <div className="font-medium">{campaign.name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {campaign.subject}
                            </div>
                            {isSending && (() => {
                              const { eta, rate } = calculateETA(jobStatus);
                              return (
                                <div className="mt-2 space-y-1">
                                  <Progress value={jobStatus.progress || 0} className="h-1.5" />
                                  <div className="text-xs text-muted-foreground">
                                    {jobStatus.progress}% • {(jobStatus.processedCount || 0).toLocaleString()} / {(jobStatus.totalRecipients || 0).toLocaleString()} sent
                                    {jobStatus.failedCount ? ` • ${jobStatus.failedCount} failed` : ''}
                                    {rate && ` • ${rate}/sec`}
                                    {eta && ` • ~${eta} remaining`}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="truncate max-w-[100px]">{campaign.creatorName}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Created by {campaign.creatorName}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            {isSending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <Badge variant="secondary" className="font-normal">
                                  Sending ({jobStatus.currentBatch}/{jobStatus.totalBatches})
                                </Badge>
                              </div>
                            ) : (
                              <Badge 
                                variant={
                                  campaign.status === 'completed' ? 'default' : 
                                  campaign.status === 'sending' ? 'secondary' : 
                                  campaign.status === 'failed' ? 'destructive' :
                                  'outline'
                                }
                                className="font-normal capitalize"
                                data-testid={`badge-status-${campaign.id}`}
                              >
                                {campaign.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {campaign.status === 'completed' && campaign.sentAt
                              ? format(new Date(campaign.sentAt), 'MMM d, yyyy')
                              : campaign.status === 'scheduled' && campaign.scheduledFor
                              ? `Sched: ${format(new Date(campaign.scheduledFor), 'MMM d')}`
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-right font-medium" data-testid={`text-delivered-${campaign.id}`}>
                            {campaign.totalDelivered > 0 ? campaign.totalDelivered.toLocaleString() : '-'}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-open-rate-${campaign.id}`}>
                            {openRate}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-click-rate-${campaign.id}`}>
                            {clickRate}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => setLocation(`/campaigns/${campaign.id}/analytics`)}
                                  data-testid={`button-analytics-${campaign.id}`}
                                >
                                  <BarChart3 className="w-4 h-4 mr-2" />
                                  View Analytics
                                </DropdownMenuItem>
                                {campaign.status === 'draft' && canEditCampaign(campaign) && (
                                  <DropdownMenuItem 
                                    onClick={() => setLocation(`/campaigns/${campaign.id}/edit`)}
                                    data-testid={`button-edit-${campaign.id}`}
                                  >
                                    <FileEdit className="w-4 h-4 mr-2" />
                                    Edit Campaign
                                  </DropdownMenuItem>
                                )}
                                {campaign.status === 'draft' && canEditCampaign(campaign) && (
                                  <DropdownMenuItem 
                                    onClick={() => sendMutation.mutate(campaign.id)}
                                    data-testid={`button-send-${campaign.id}`}
                                  >
                                    <Send className="w-4 h-4 mr-2" />
                                    Send Now
                                  </DropdownMenuItem>
                                )}
                                {campaign.status === 'scheduled' && canEditCampaign(campaign) && (
                                  <DropdownMenuItem 
                                    onClick={() => unscheduleMutation.mutate(campaign.id)}
                                    data-testid={`button-unschedule-${campaign.id}`}
                                  >
                                    <X className="w-4 h-4 mr-2" />
                                    Cancel Schedule
                                  </DropdownMenuItem>
                                )}
                                {isSending && canEditCampaign(campaign) && (
                                  <DropdownMenuItem 
                                    onClick={() => pauseMutation.mutate(campaign.id)}
                                    data-testid={`button-pause-${campaign.id}`}
                                  >
                                    <Pause className="w-4 h-4 mr-2" />
                                    Pause Sending
                                  </DropdownMenuItem>
                                )}
                                {canEditCampaign(campaign) && <DropdownMenuSeparator />}
                                {canEditCampaign(campaign) && (
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => deleteMutation.mutate(campaign.id)}
                                    data-testid={`button-delete-${campaign.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
