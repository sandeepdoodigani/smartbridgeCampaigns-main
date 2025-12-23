import { useState, useEffect, lazy, Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Send, Save, Loader2, AlertCircle, Code, FileEdit, FlaskConical, Users, Sparkles, Calendar, Clock, X, LayoutGrid } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Textarea } from "@/components/ui/textarea";

const EmailBuilder = lazy(() => import("@/components/EmailBuilder").then(m => ({ default: m.EmailBuilder })));

export default function CampaignNew() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  
  const isEditMode = location.includes('/edit') && params.id;
  const campaignId = params.id;

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [aiImprovements, setAiImprovements] = useState<string[]>([]);
  const [senderIdentityId, setSenderIdentityId] = useState<string>("");
  const [activeEditorTab, setActiveEditorTab] = useState<string>("builder");
  const [contentSource, setContentSource] = useState<"builder" | "editor" | "html" | "ai" | null>(null);
  const [builderKey, setBuilderKey] = useState<string>("initial");

  const { data: sesSettings } = useQuery({
    queryKey: ["ses-settings"],
    queryFn: api.settings.getSES,
  });

  const { data: segments = [] } = useQuery({
    queryKey: ["segments"],
    queryFn: api.segments.getAll,
  });

  const { data: senderIdentities = [] } = useQuery({
    queryKey: ["sender-identities"],
    queryFn: api.settings.getSenders,
  });

  const { data: existingCampaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.campaigns.get(campaignId!),
    enabled: !!isEditMode && !!campaignId,
  });

  useEffect(() => {
    if (isEditMode && existingCampaign && !isInitialized) {
      setName(existingCampaign.name);
      setSubject(existingCampaign.subject);
      setHtmlContent(existingCampaign.htmlContent || "");
      setSegmentId(existingCampaign.segmentId || "");
      setSenderIdentityId(existingCampaign.senderIdentityId || "");
      setBuilderKey(`campaign-${campaignId}-${Date.now()}`);
      setIsInitialized(true);
    }
  }, [isEditMode, existingCampaign, isInitialized, campaignId]);

  const selectedSender = senderIdentities.find(s => s.id === senderIdentityId);

  const selectedSegment = segments.find(s => s.id === segmentId);

  const createMutation = useMutation({
    mutationFn: api.campaigns.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({
        title: "Campaign Created",
        description: "Your campaign has been saved as a draft.",
      });
      setLocation("/campaigns");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; subject?: string; htmlContent?: string; segmentId?: string; senderIdentityId?: string; status?: string }) => 
      api.campaigns.update(campaignId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      toast({
        title: "Campaign Updated",
        description: "Your campaign has been updated successfully.",
      });
      setLocation("/campaigns");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!isEditMode || !campaignId) {
        throw new Error("Please save the campaign and send a test email before launching.");
      }
      await api.campaigns.update(campaignId, {
        name,
        subject,
        htmlContent,
        segmentId,
        senderIdentityId: senderIdentityId || undefined,
        status: "draft",
      });
      return api.campaigns.send(campaignId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast({
        title: "Campaign Sent",
        description: result.message || `Campaign queued successfully.`,
      });
      setLocation("/campaigns");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Send Failed",
        description: error.message,
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: api.campaigns.sendTest,
    onSuccess: (result) => {
      if (isEditMode && campaignId) {
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      }
      toast({
        title: "Test Email Sent",
        description: result.message,
      });
      setTestDialogOpen(false);
      setTestEmail("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Test Failed",
        description: error.message,
      });
    },
  });

  const aiTemplateMutation = useMutation({
    mutationFn: api.ai.generateTemplate,
    onSuccess: (result) => {
      setHtmlContent(result.htmlTemplate);
      setContentSource("ai");
      setActiveEditorTab("html");
      setBuilderKey(`ai-${Date.now()}`);
      setAiImprovements(result.improvements);
      toast({
        title: "Template Generated",
        description: `AI made ${result.improvements.length} improvements to your email.`,
      });
      setAiDialogOpen(false);
      setAiDraft("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "AI Generation Failed",
        description: error.message,
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!isEditMode || !campaignId) {
        throw new Error("Please save the campaign and send a test email before scheduling.");
      }
      await api.campaigns.update(campaignId, {
        name,
        subject,
        htmlContent,
        segmentId,
        senderIdentityId: senderIdentityId || undefined,
        status: "draft",
      });
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      return api.campaigns.schedule(campaignId, scheduledDateTime.toISOString());
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({
        title: "Campaign Scheduled",
        description: result.message,
      });
      setScheduleDialogOpen(false);
      setLocation("/campaigns");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Schedule Failed",
        description: error.message,
      });
    },
  });

  const handleSendTest = () => {
    if (!subject) {
      toast({
        variant: "destructive",
        title: "Missing Subject",
        description: "Please enter a subject line before sending a test.",
      });
      return;
    }
    if (!testEmail) {
      toast({
        variant: "destructive",
        title: "Missing Email",
        description: "Please enter an email address to send the test to.",
      });
      return;
    }
    if (!senderIdentityId) {
      toast({
        variant: "destructive",
        title: "Missing Sender",
        description: "Please select a sender email address before sending a test.",
      });
      return;
    }
    testMutation.mutate({
      subject,
      htmlContent,
      testEmail,
      senderIdentityId,
      campaignId: isEditMode ? campaignId : undefined,
    });
  };

  const handleGenerateTemplate = () => {
    if (!aiDraft || aiDraft.length < 10) {
      toast({
        variant: "destructive",
        title: "Draft Too Short",
        description: "Please enter at least 10 characters for the AI to work with.",
      });
      return;
    }
    aiTemplateMutation.mutate(aiDraft);
  };

  const handleSchedule = () => {
    if (!name || !subject) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please enter a campaign name and subject line.",
      });
      return;
    }
    if (!segmentId) {
      toast({
        variant: "destructive",
        title: "Segment Required",
        description: "Please select a segment before scheduling.",
      });
      return;
    }
    if (!senderIdentityId) {
      toast({
        variant: "destructive",
        title: "Sender Required",
        description: "Please select a sender email address before scheduling.",
      });
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      toast({
        variant: "destructive",
        title: "Schedule Required",
        description: "Please select a date and time to schedule the campaign.",
      });
      return;
    }
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledDateTime <= new Date()) {
      toast({
        variant: "destructive",
        title: "Invalid Time",
        description: "Scheduled time must be in the future.",
      });
      return;
    }
    if (isEditMode && !existingCampaign?.testEmailSentAt) {
      toast({
        variant: "destructive",
        title: "Test Email Required",
        description: "Please send a test email before scheduling this campaign.",
      });
      return;
    }
    if (!isEditMode) {
      toast({
        variant: "destructive",
        title: "Save Campaign First",
        description: "Please save the campaign and send a test email before scheduling.",
      });
      return;
    }
    scheduleMutation.mutate();
  };

  const handleSave = () => {
    if (!name || !subject) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please enter a campaign name and subject line.",
      });
      return;
    }
    
    const campaignData = {
      name,
      subject,
      htmlContent,
      segmentId: segmentId || undefined,
      senderIdentityId: senderIdentityId || undefined,
      status: "draft" as const,
    };
    
    if (isEditMode) {
      updateMutation.mutate(campaignData);
    } else {
      createMutation.mutate(campaignData);
    }
  };

  const handleSend = () => {
    if (!name || !subject) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please enter a campaign name and subject line.",
      });
      return;
    }
    if (!segmentId) {
      toast({
        variant: "destructive",
        title: "Segment Required",
        description: "Please select a segment to send this campaign to.",
      });
      return;
    }
    if (!senderIdentityId) {
      toast({
        variant: "destructive",
        title: "Sender Required",
        description: "Please select a sender email address before sending.",
      });
      return;
    }
    if (!sesSettings?.isVerified) {
      toast({
        variant: "destructive",
        title: "SES Not Configured",
        description: "Please configure and verify your AWS SES settings first.",
      });
      return;
    }
    if (isEditMode && !existingCampaign?.testEmailSentAt) {
      toast({
        variant: "destructive",
        title: "Test Email Required",
        description: "Please send a test email before launching this campaign.",
      });
      return;
    }
    if (!isEditMode) {
      toast({
        variant: "destructive",
        title: "Save Campaign First",
        description: "Please save the campaign and send a test email before launching.",
      });
      return;
    }
    sendMutation.mutate();
  };

  const testEmailSent = isEditMode && existingCampaign?.testEmailSentAt;
  const canSend = sesSettings?.isVerified && segmentId && selectedSegment && selectedSegment.count > 0 && senderIdentityId && isEditMode && testEmailSent;
  const isSending = createMutation.isPending || sendMutation.isPending;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-5xl mx-auto space-y-8">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="icon">
                <Link href="/campaigns">
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight font-display">Create Campaign</h2>
                <p className="text-muted-foreground">
                  Design and send your next email blast.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!sesSettings?.isVerified} className="gap-2" data-testid="button-send-test">
                    <FlaskConical className="w-4 h-4" />
                    Send Test
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send Test Email</DialogTitle>
                    <DialogDescription>
                      Send a test email to preview how your campaign will look. The subject will be prefixed with [TEST].
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="test-email">Email Address</Label>
                      <Input 
                        id="test-email" 
                        type="email"
                        placeholder="your@email.com" 
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        data-testid="input-test-email"
                      />
                    </div>
                    {!subject && (
                      <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                        Enter a subject line above before sending a test.
                      </p>
                    )}
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSendTest} 
                      disabled={testMutation.isPending || !subject}
                      data-testid="button-confirm-test"
                    >
                      {testMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Send Test
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={handleSave} disabled={isSending} className="gap-2" data-testid="button-save-draft">
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Save className="w-4 h-4" />
                Save Draft
              </Button>
              
              <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={isSending || !canSend} className="gap-2" data-testid="button-schedule">
                    <Calendar className="w-4 h-4" />
                    Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule Campaign</DialogTitle>
                    <DialogDescription>
                      Choose when to send this campaign. The campaign will be sent automatically at the scheduled time.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="schedule-date">Date</Label>
                        <Input 
                          id="schedule-date" 
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          data-testid="input-schedule-date"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="schedule-time">Time</Label>
                        <Input 
                          id="schedule-time" 
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          data-testid="input-schedule-time"
                        />
                      </div>
                    </div>
                    {scheduledDate && scheduledTime && (
                      <div className="p-3 bg-indigo-50 rounded-lg flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-600" />
                        <p className="text-sm text-indigo-800">
                          Campaign will be sent on {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSchedule} 
                      disabled={scheduleMutation.isPending || !scheduledDate || !scheduledTime}
                      data-testid="button-confirm-schedule"
                    >
                      {scheduleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Schedule Campaign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Button onClick={handleSend} disabled={isSending || !canSend} className="gap-2" data-testid="button-send-now">
                {sendMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                Send Now
              </Button>
            </div>
          </div>

          {!sesSettings?.isVerified && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="py-4 flex items-center gap-4">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-800">AWS SES Not Configured</p>
                  <p className="text-sm text-yellow-700">You need to configure AWS SES in Settings before you can send emails.</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">Configure</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {isEditMode && !existingCampaign?.testEmailSentAt && sesSettings?.isVerified && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4 flex items-center gap-4">
                <FlaskConical className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800">Test Email Required</p>
                  <p className="text-sm text-blue-700">Send a test email to preview your campaign before launching.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setTestDialogOpen(true)}>
                  Send Test
                </Button>
              </CardContent>
            </Card>
          )}

          {isEditMode && existingCampaign?.testEmailSentAt && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4 flex items-center gap-4">
                <FlaskConical className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-green-800">Test Email Sent</p>
                  <p className="text-sm text-green-700">Test email was sent on {new Date(existingCampaign.testEmailSentAt).toLocaleString()}. Your campaign is ready to launch.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!isEditMode && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4 flex items-center gap-4">
                <AlertCircle className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800">Save Before Sending</p>
                  <p className="text-sm text-blue-700">Save this campaign as a draft first, then send a test email before you can launch it.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-8 grid-cols-3">
            <div className="col-span-2 space-y-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                  <CardDescription>Basic information about this campaign.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Campaign Name</Label>
                    <Input 
                      id="name" 
                      placeholder="e.g. March Newsletter" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="input-campaign-name" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject Line</Label>
                    <Input 
                      id="subject" 
                      placeholder="What will they see in their inbox?" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-campaign-subject" 
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Content</CardTitle>
                      <CardDescription>Compose your email content using the visual editor or raw HTML.</CardDescription>
                    </div>
                    <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2" data-testid="button-ai-generate">
                          <Sparkles className="w-4 h-4" />
                          Generate with AI
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-indigo-600" />
                            AI Template Generator
                          </DialogTitle>
                          <DialogDescription>
                            Write or paste your email draft and let AI correct any mistakes and generate a professional HTML template.
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="ai-draft">Your Email Draft</Label>
                            <Textarea 
                              id="ai-draft" 
                              placeholder="Paste your email draft here. For example:

Hi there,

We're excited to anounce our new product launch! This amazing product will help you save time and money.

Here's what you get:
- Feature 1
- Feature 2
- Feature 3

Click here to learn more.

Best regards,
Your Team"
                              value={aiDraft}
                              onChange={(e) => setAiDraft(e.target.value)}
                              className="min-h-[200px]"
                              data-testid="textarea-ai-draft"
                            />
                            <p className="text-xs text-muted-foreground">
                              The AI will check for spelling, grammar, and formatting issues, then generate a professional HTML email template.
                            </p>
                          </div>
                        </div>
                        
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleGenerateTemplate} 
                            disabled={aiTemplateMutation.isPending || !aiDraft || aiDraft.length < 10}
                            className="gap-2"
                            data-testid="button-confirm-ai-generate"
                          >
                            {aiTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Sparkles className="w-4 h-4" />
                            Generate Template
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeEditorTab} onValueChange={(tab) => {
                    if (tab === "builder" && activeEditorTab !== "builder" && contentSource !== "builder") {
                      setBuilderKey(`refresh-${Date.now()}`);
                    }
                    setActiveEditorTab(tab);
                  }}>
                    <TabsList className="grid w-full grid-cols-4 mb-4">
                      <TabsTrigger value="builder" className="gap-2" data-testid="tab-builder">
                        <LayoutGrid className="w-4 h-4" />
                        Drag & Drop
                      </TabsTrigger>
                      <TabsTrigger value="editor" className="gap-2" data-testid="tab-editor">
                        <FileEdit className="w-4 h-4" />
                        Rich Text
                      </TabsTrigger>
                      <TabsTrigger value="html" className="gap-2" data-testid="tab-html">
                        <Code className="w-4 h-4" />
                        HTML Code
                      </TabsTrigger>
                      <TabsTrigger value="preview" data-testid="tab-preview">Preview</TabsTrigger>
                    </TabsList>
                    
                    {contentSource === "builder" && activeEditorTab === "editor" && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                        <p className="text-sm text-yellow-800">
                          Content was created with Drag & Drop builder. Editing in Rich Text mode may affect formatting.
                        </p>
                      </div>
                    )}
                    
                    <TabsContent value="builder">
                      <Suspense fallback={
                        <div className="flex items-center justify-center h-[600px] border rounded-lg bg-muted/20">
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Loading email builder...</p>
                          </div>
                        </div>
                      }>
                        <EmailBuilder 
                          initialHtml={htmlContent}
                          builderKey={builderKey}
                          onChange={(html) => {
                            setHtmlContent(html);
                            setContentSource("builder");
                          }}
                        />
                      </Suspense>
                    </TabsContent>
                    <TabsContent value="editor">
                      <RichTextEditor 
                        content={htmlContent}
                        onChange={(html) => {
                          setHtmlContent(html);
                          setContentSource("editor");
                        }}
                        placeholder="Start writing your email content..."
                      />
                    </TabsContent>
                    <TabsContent value="html">
                      <Textarea 
                        className="font-mono text-sm min-h-[300px]" 
                        placeholder="<html>
<body>
  <h1>Hello!</h1>
  <p>Your email content here...</p>
  <a href='https://example.com'>Click here</a>
</body>
</html>"
                        value={htmlContent}
                        onChange={(e) => {
                          setHtmlContent(e.target.value);
                          setContentSource("html");
                        }}
                        data-testid="textarea-html-content"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Tip: Switching to Drag & Drop will reload the builder with your HTML changes.
                      </p>
                    </TabsContent>
                    <TabsContent value="preview" className="min-h-[300px] border rounded-md p-4 bg-white">
                      {htmlContent ? (
                        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
                      ) : (
                        <p className="text-sm text-muted-foreground italic text-center py-20">
                          Enter content to see preview
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Audience</CardTitle>
                  <CardDescription>Select a segment to target</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="segment">Segment</Label>
                    <Select value={segmentId} onValueChange={setSegmentId}>
                      <SelectTrigger data-testid="select-segment">
                        <SelectValue placeholder="Select a segment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {segments.map((seg) => (
                          <SelectItem key={seg.id} value={seg.id}>
                            {seg.name} ({seg.count} subscribers)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedSegment ? (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-medium">{selectedSegment.name}</p>
                      </div>
                      <p className="text-2xl font-bold font-display mt-1">{selectedSegment.count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">subscribers will receive this email</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-800">Select a segment to send your campaign</p>
                    </div>
                  )}
                  
                  {segments.length === 0 && (
                    <Button variant="outline" asChild className="w-full">
                      <Link href="/segments">Create Segment</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Sender</CardTitle>
                  <CardDescription>Select the from address for this campaign</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sesSettings ? (
                    <>
                      {senderIdentities.filter(s => s.isActive !== false).length > 0 ? (
                        <div className="space-y-2">
                          <Label htmlFor="sender">From Address</Label>
                          <Select value={senderIdentityId} onValueChange={setSenderIdentityId}>
                            <SelectTrigger data-testid="select-sender">
                              <SelectValue placeholder="Select a sender..." />
                            </SelectTrigger>
                            <SelectContent>
                              {senderIdentities.filter(s => s.isActive !== false).map((sender) => (
                                <SelectItem key={sender.id} value={sender.id}>
                                  {sender.name} &lt;{sender.email}&gt;
                                  {sender.isDefault && " (Default)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="p-3 bg-muted/50 rounded-md">
                          <p className="text-sm font-medium">{sesSettings.fromName}</p>
                          <p className="text-xs text-muted-foreground">{sesSettings.fromEmail}</p>
                        </div>
                      )}
                      
                      {selectedSender && (
                        <div className="p-3 bg-muted/50 rounded-md">
                          <p className="text-sm font-medium">{selectedSender.name}</p>
                          <p className="text-xs text-muted-foreground">{selectedSender.email}</p>
                          {!selectedSender.isVerified && (
                            <div className="flex items-center gap-1 mt-1 text-yellow-600 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              Not verified in SES
                            </div>
                          )}
                        </div>
                      )}
                      
                      {senderIdentities.filter(s => s.isActive !== false).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Region: {sesSettings.region}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Configure AWS SES in Settings
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
