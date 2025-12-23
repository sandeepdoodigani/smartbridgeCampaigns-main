import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Subscriber, Segment } from "@shared/schema";
import { format } from "date-fns";
import { Search, Upload, UserPlus, Users, FileText, Check, Loader2, Trash2, Download, Pencil, Tag, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Settings2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import Papa from "papaparse";
import { useAuth } from "@/hooks/useAuth";

const BATCH_SIZE = 2000;
const PAGE_SIZE = 50;

export default function Subscribers() {
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newContactTags, setNewContactTags] = useState<string[]>([]);
  const [newContactTagInput, setNewContactTagInput] = useState("");
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [editStatus, setEditStatus] = useState<string>("active");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importTag, setImportTag] = useState("");
  const [importSegmentId, setImportSegmentId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: subscribersData, isLoading: loadingSubscribers } = useQuery({
    queryKey: ["subscribers", currentPage, debouncedSearch, statusFilter, tagFilter],
    queryFn: () => api.subscribers.getAll({ 
      page: currentPage, 
      limit: PAGE_SIZE, 
      search: debouncedSearch,
      status: statusFilter || undefined,
      tag: tagFilter || undefined,
    }),
  });
  
  const subscribers = subscribersData?.subscribers || [];
  const totalPages = Math.max(1, subscribersData?.totalPages || 1);
  const totalSubscribers = subscribersData?.total || 0;

  const { data: segments = [], isLoading: loadingSegments } = useQuery({
    queryKey: ["segments"],
    queryFn: api.segments.getAll,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.tags.getAll,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Subscriber> }) => api.subscribers.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({
        title: "Subscriber Updated",
        description: "Changes have been saved.",
      });
      setEditingSubscriber(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message,
      });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: api.subscribers.bulkCreate,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      const description = parts.length > 0 
        ? `${parts.join(', ')} contacts`
        : 'No contacts imported';
      
      toast({
        title: "Import Complete",
        description,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error.message,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: api.subscribers.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      toast({
        title: "Contact Added",
        description: "New subscriber has been added successfully.",
      });
      setAddContactOpen(false);
      setNewEmail("");
      setNewFirstName("");
      setNewLastName("");
      setNewContactTags([]);
      setNewContactTagInput("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Add Contact",
        description: error.message,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.subscribers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast({
        title: "Subscriber Deleted",
        description: "The subscriber has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    },
  });

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [deleteTagAction, setDeleteTagAction] = useState<'subscribers' | 'tag' | null>(null);

  const deleteSubscribersByTagMutation = useMutation({
    mutationFn: (tag: string) => api.tags.deleteSubscribersByTag(tag),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({
        title: "Subscribers Deleted",
        description: data.message,
      });
      setTagToDelete(null);
      setDeleteTagAction(null);
      setTagFilter("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message,
      });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: (tag: string) => api.tags.removeTag(tag),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast({
        title: "Tag Removed",
        description: data.message,
      });
      setTagToDelete(null);
      setDeleteTagAction(null);
      setManageTagsOpen(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Remove Tag Failed",
        description: error.message,
      });
    },
  });

  const handleAddContact = () => {
    if (!newEmail) {
      toast({
        variant: "destructive",
        title: "Email Required",
        description: "Please enter an email address.",
      });
      return;
    }
    createMutation.mutate({
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      status: 'active',
      tags: newContactTags,
    });
  };

  const addNewContactTag = () => {
    if (newContactTagInput.trim() && !newContactTags.includes(newContactTagInput.trim())) {
      setNewContactTags([...newContactTags, newContactTagInput.trim()]);
      setNewContactTagInput("");
    }
  };

  const removeNewContactTag = (tag: string) => {
    setNewContactTags(newContactTags.filter(t => t !== tag));
  };

  const openEditDialog = (subscriber: Subscriber) => {
    setEditingSubscriber(subscriber);
    setEditTags(subscriber.tags || []);
    setEditStatus(subscriber.status);
  };

  const addEditTag = () => {
    if (newTagInput.trim() && !editTags.includes(newTagInput.trim())) {
      setEditTags([...editTags, newTagInput.trim()]);
      setNewTagInput("");
    }
  };

  const removeEditTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };

  const handleSaveSubscriber = () => {
    if (!editingSubscriber) return;
    updateMutation.mutate({
      id: editingSubscriber.id,
      data: {
        tags: editTags,
        status: editStatus,
      },
    });
  };

  const downloadCsvTemplate = () => {
    const csvContent = "email,firstName,lastName\njohn@example.com,John,Doe\njane@example.com,Jane,Smith\n";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subscribers_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
  };

  const resetImportDialog = () => {
    setSelectedFile(null);
    setImportTag("");
    setImportSegmentId("");
    setIsImporting(false);
    setImportProgress(0);
    setImportStatus("");
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    setImportProgress(5);
    setImportStatus("Parsing CSV file...");

    const tags: string[] = [];
    if (importTag.trim()) {
      tags.push(importTag.trim());
    }
    
    const selectedSegment = importSegmentId && importSegmentId !== "none" 
      ? segments.find(s => s.id === importSegmentId) 
      : null;
    if (selectedSegment) {
      const rules = selectedSegment.rules as any;
      if (rules?.tags && Array.isArray(rules.tags)) {
        rules.tags.forEach((tag: string) => {
          if (!tags.includes(tag)) {
            tags.push(tag);
          }
        });
      }
    }

    Papa.parse(selectedFile, {
      header: true,
      complete: async (results) => {
        const allSubscribers = results.data
          .filter((row: any) => row.email && row.email.trim())
          .map((row: any) => ({
            email: row.email.trim().toLowerCase(),
            firstName: row.firstName || row.first_name || '',
            lastName: row.lastName || row.last_name || '',
            status: 'active' as const,
            tags: tags.length > 0 ? tags : ['imported'],
          }));

        const totalCount = allSubscribers.length;
        const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
        
        setImportProgress(10);
        setImportStatus(`Found ${totalCount.toLocaleString()} contacts. Importing in ${totalBatches} batch${totalBatches > 1 ? 'es' : ''}...`);

        let totalCreated = 0;
        let totalUpdated = 0;
        let failedBatches = 0;

        for (let i = 0; i < totalBatches; i++) {
          const start = i * BATCH_SIZE;
          const end = Math.min(start + BATCH_SIZE, totalCount);
          const batch = allSubscribers.slice(start, end);
          
          const batchNum = i + 1;
          setImportStatus(`Importing batch ${batchNum} of ${totalBatches} (${start + 1}-${end} of ${totalCount.toLocaleString()})...`);
          
          try {
            const result = await api.subscribers.bulkCreate(batch);
            totalCreated += result.created || 0;
            totalUpdated += result.updated || 0;
          } catch (error: any) {
            console.error(`Batch ${batchNum} failed:`, error);
            failedBatches++;
          }
          
          const progress = 10 + Math.round(((i + 1) / totalBatches) * 85);
          setImportProgress(progress);
        }

        setImportProgress(100);
        setImportStatus("Import complete!");
        
        queryClient.invalidateQueries({ queryKey: ["subscribers"] });
        queryClient.invalidateQueries({ queryKey: ["tags"] });
        queryClient.invalidateQueries({ queryKey: ["segments"] });

        const parts = [];
        if (totalCreated > 0) parts.push(`${totalCreated.toLocaleString()} new`);
        if (totalUpdated > 0) parts.push(`${totalUpdated.toLocaleString()} updated`);
        
        let description = parts.length > 0 ? `${parts.join(', ')} contacts` : 'No contacts imported';
        if (failedBatches > 0) {
          description += ` (${failedBatches} batch${failedBatches > 1 ? 'es' : ''} failed)`;
        }

        toast({
          title: failedBatches > 0 ? "Import Completed with Errors" : "Import Complete",
          description,
          variant: failedBatches > 0 ? "destructive" : "default",
        });

        setTimeout(() => {
          resetImportDialog();
          setImportDialogOpen(false);
        }, 1500);
      },
      error: (error) => {
        setIsImporting(false);
        setImportStatus("");
        toast({
          variant: "destructive",
          title: "Parse Error",
          description: error.message,
        });
      }
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 pl-64">
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight font-display">Audience</h2>
              <p className="text-muted-foreground mt-1">
                Manage your contacts and segments.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={importDialogOpen} onOpenChange={(open) => {
                setImportDialogOpen(open);
                if (!open) resetImportDialog();
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="button-import-csv">
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Contacts</DialogTitle>
                    <DialogDescription>
                      {!selectedFile 
                        ? "Upload a CSV file with columns: email, firstName, lastName."
                        : "Configure import options before importing."}
                    </DialogDescription>
                  </DialogHeader>
                  
                  {isImporting ? (
                    <div className="py-10 flex flex-col items-center justify-center space-y-4">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <div className="text-center space-y-2">
                        <p className="font-medium">Importing contacts...</p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 max-w-xs mx-auto">
                          <div 
                            className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                            style={{ width: `${importProgress}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-muted-foreground">{importProgress}% complete</p>
                        {importStatus && (
                          <p className="text-xs text-muted-foreground max-w-xs">{importStatus}</p>
                        )}
                      </div>
                    </div>
                  ) : !selectedFile ? (
                    <div className="grid gap-4 py-4">
                      <Button 
                        variant="outline" 
                        onClick={downloadCsvTemplate} 
                        className="gap-2 w-full"
                        data-testid="button-download-template"
                      >
                        <Download className="w-4 h-4" />
                        Download CSV Template
                      </Button>
                      
                      <div className="flex items-center justify-center w-full">
                        <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted border-muted-foreground/25">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">CSV files only</p>
                          </div>
                          <input 
                            id="dropzone-file" 
                            type="file" 
                            accept=".csv" 
                            className="hidden" 
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            data-testid="input-csv-file"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 py-4">
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <FileText className="w-5 h-5 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={resetImportDialog}
                          data-testid="button-change-file"
                        >
                          Change
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="import-tag">Add Tag</Label>
                        <Input
                          id="import-tag"
                          placeholder="e.g., newsletter, customer, lead"
                          value={importTag}
                          onChange={(e) => setImportTag(e.target.value)}
                          data-testid="input-import-tag"
                        />
                        <p className="text-xs text-muted-foreground">
                          This tag will be added to all imported contacts
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="import-segment">Add to Segment</Label>
                        <Select value={importSegmentId} onValueChange={setImportSegmentId}>
                          <SelectTrigger data-testid="select-import-segment">
                            <SelectValue placeholder="Select a segment (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No segment</SelectItem>
                            {segments.map((segment) => {
                              const rules = segment.rules as any;
                              const tagInfo = rules?.tags?.length 
                                ? ` (adds: ${rules.tags.join(', ')})` 
                                : rules?.type === 'all' ? ' (all subscribers)' : '';
                              return (
                                <SelectItem key={segment.id} value={segment.id}>
                                  {segment.name}{tagInfo}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {importSegmentId && importSegmentId !== "none" && (() => {
                          const seg = segments.find(s => s.id === importSegmentId);
                          const rules = seg?.rules as any;
                          if (rules?.type === 'all') {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Imported contacts will automatically be in this segment (includes all active subscribers)
                              </p>
                            );
                          } else if (rules?.tags?.length) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Tags <span className="font-medium">{rules.tags.join(', ')}</span> will be added to match this segment
                              </p>
                            );
                          }
                          return (
                            <p className="text-xs text-muted-foreground">
                              Contacts will be added to this segment
                            </p>
                          );
                        })()}
                        {(!importSegmentId || importSegmentId === "none") && (
                          <p className="text-xs text-muted-foreground">
                            Choose a segment to automatically add the required tags
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {selectedFile && !isImporting && (
                    <DialogFooter>
                      <Button variant="outline" onClick={resetImportDialog}>
                        Cancel
                      </Button>
                      <Button onClick={handleImport} data-testid="button-start-import">
                        <Upload className="w-4 h-4 mr-2" />
                        Import Contacts
                      </Button>
                    </DialogFooter>
                  )}
                </DialogContent>
              </Dialog>
              
              <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 shadow-lg shadow-primary/20" data-testid="button-add-contact">
                    <UserPlus className="w-4 h-4" />
                    Add Contact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Contact</DialogTitle>
                    <DialogDescription>
                      Add a single subscriber to your mailing list.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input 
                        id="email" 
                        type="email"
                        placeholder="john@example.com" 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        data-testid="input-new-email"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input 
                          id="firstName" 
                          placeholder="John" 
                          value={newFirstName}
                          onChange={(e) => setNewFirstName(e.target.value)}
                          data-testid="input-new-firstname"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input 
                          id="lastName" 
                          placeholder="Doe" 
                          value={newLastName}
                          onChange={(e) => setNewLastName(e.target.value)}
                          data-testid="input-new-lastname"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add a tag..."
                          value={newContactTagInput}
                          onChange={(e) => setNewContactTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addNewContactTag();
                            }
                          }}
                          data-testid="input-new-contact-tag"
                        />
                        <Button type="button" variant="outline" onClick={addNewContactTag}>
                          <Tag className="w-4 h-4" />
                        </Button>
                      </div>
                      {newContactTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {newContactTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="gap-1">
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeNewContactTag(tag)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddContactOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddContact} 
                      disabled={createMutation.isPending}
                      data-testid="button-save-contact"
                    >
                      {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Add Contact
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Tabs defaultValue="contacts" className="space-y-6">
            <TabsList>
              <TabsTrigger value="contacts" className="gap-2" data-testid="tab-contacts">
                <Users className="w-4 h-4" />
                All Contacts
              </TabsTrigger>
              <TabsTrigger value="segments" className="gap-2" data-testid="tab-segments">
                <FileText className="w-4 h-4" />
                Segments
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="space-y-4">
              <Card className="border-none shadow-sm">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search by email or name..." 
                        className="pl-9 bg-background border-none ring-offset-0 focus-visible:ring-0" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        data-testid="input-search-subscribers" 
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val === "all" ? "" : val); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                        <SelectItem value="bounced">Bounced</SelectItem>
                        <SelectItem value="complained">Complained</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={tagFilter} onValueChange={(val) => { setTagFilter(val === "all" ? "" : val); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[160px]" data-testid="select-tag-filter">
                        <SelectValue placeholder="All Tags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
                        {allTags.map((tag) => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(statusFilter || tagFilter) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setStatusFilter(""); setTagFilter(""); setCurrentPage(1); }}
                        className="text-muted-foreground"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear Filters
                      </Button>
                    )}
                    {isAdmin && tagFilter && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            data-testid="button-delete-by-tag"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete All with "{tagFilter}"
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-red-500" />
                              Delete Subscribers by Tag
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete <strong>all subscribers</strong> who have the tag "{tagFilter}". 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteSubscribersByTagMutation.mutate(tagFilter)}
                              className="bg-red-500 hover:bg-red-600"
                              disabled={deleteSubscribersByTagMutation.isPending}
                            >
                              {deleteSubscribersByTagMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-1" />
                              )}
                              Delete All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {isAdmin && allTags.length > 0 && (
                      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-manage-tags">
                            <Settings2 className="w-4 h-4 mr-1" />
                            Manage Tags
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Manage Tags</DialogTitle>
                            <DialogDescription>
                              Delete tags or remove them from all subscribers. These actions cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3 max-h-[300px] overflow-y-auto">
                            {allTags.map((tag) => (
                              <div key={tag} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                                <div className="flex items-center gap-2">
                                  <Tag className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{tag}</span>
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem 
                                      className="text-red-600"
                                      onClick={() => {
                                        setTagToDelete(tag);
                                        setDeleteTagAction('subscribers');
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete all subscribers with this tag
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-orange-600"
                                      onClick={() => {
                                        setTagToDelete(tag);
                                        setDeleteTagAction('tag');
                                      }}
                                    >
                                      <X className="w-4 h-4 mr-2" />
                                      Remove tag from all subscribers
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            ))}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setManageTagsOpen(false)}>
                              Close
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    <div className="ml-auto text-sm text-muted-foreground">
                      {totalSubscribers.toLocaleString()} contact{totalSubscribers !== 1 ? 's' : ''}
                    </div>
                  </div>
                  
                  {loadingSubscribers ? (
                    <div className="py-20 flex justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : subscribers.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="text-sm">
                        {debouncedSearch || statusFilter || tagFilter
                          ? "No subscribers found matching your filters."
                          : "No subscribers yet. Import a CSV or add contacts manually."}
                      </p>
                      {(debouncedSearch || statusFilter || tagFilter) && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          onClick={() => { setSearchQuery(""); setStatusFilter(""); setTagFilter(""); }}
                          className="mt-2"
                        >
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead className="text-right">Added</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscribers.map((sub) => (
                          <TableRow key={sub.id} className="hover:bg-muted/50 border-border" data-testid={`row-subscriber-${sub.id}`}>
                            <TableCell className="font-medium">
                              {sub.firstName || sub.lastName ? `${sub.firstName} ${sub.lastName}` : '-'}
                            </TableCell>
                            <TableCell data-testid={`text-email-${sub.id}`}>{sub.email}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={sub.status === 'active' ? 'outline' : 'secondary'} 
                                className={sub.status === 'active' ? 'text-green-600 border-green-200 bg-green-50' : ''}
                                data-testid={`badge-status-${sub.id}`}
                              >
                                {sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {sub.tags?.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {(!sub.tags || sub.tags.length === 0) && (
                                  <span className="text-xs text-muted-foreground">No tags</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-sm">
                              {format(new Date(sub.addedAt), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(sub)}
                                  data-testid={`button-edit-subscriber-${sub.id}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                      data-testid={`button-delete-subscriber-${sub.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Subscriber</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete {sub.email}? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMutation.mutate(sub.id)}
                                        className="bg-red-500 hover:bg-red-600"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  
                  {/* Pagination Controls */}
                  {totalSubscribers > PAGE_SIZE && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {totalSubscribers > 0 ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0} - {Math.min(currentPage * PAGE_SIZE, totalSubscribers)} of {totalSubscribers.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          data-testid="button-first-page"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1 px-2">
                          <span className="text-sm">Page</span>
                          <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                              const page = parseInt(e.target.value);
                              if (page >= 1 && page <= totalPages) {
                                setCurrentPage(page);
                              }
                            }}
                            className="w-16 h-8 text-center"
                            data-testid="input-page-number"
                          />
                          <span className="text-sm">of {totalPages.toLocaleString()}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          data-testid="button-last-page"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="segments" className="space-y-4">
              <div className="flex justify-end">
                <Button asChild>
                  <Link href="/segments">
                    <Tag className="w-4 h-4 mr-2" />
                    Manage Segments
                  </Link>
                </Button>
              </div>
              {loadingSegments ? (
                <div className="py-20 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : segments.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No segments yet</h3>
                    <p className="text-gray-500 mb-4">
                      Create segments to target specific groups of subscribers.
                    </p>
                    <Button asChild>
                      <Link href="/segments">Create Segment</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {segments.map((segment) => {
                    const rules = segment.rules as any;
                    const ruleDescription = rules?.type === 'all' 
                      ? 'All active subscribers' 
                      : rules?.type === 'tags_any' 
                        ? `Has any tag: ${rules.tags?.join(', ') || 'none'}`
                        : rules?.type === 'tags_all'
                          ? `Has all tags: ${rules.tags?.join(', ') || 'none'}`
                          : 'Custom rules';
                    
                    return (
                      <Card key={segment.id} className="hover:border-primary/50 transition-colors" data-testid={`card-segment-${segment.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-base font-medium">{segment.name}</CardTitle>
                            <Badge variant="secondary" data-testid={`badge-count-${segment.id}`}>{segment.count.toLocaleString()}</Badge>
                          </div>
                          <CardDescription>{segment.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Badge variant="outline" className="text-xs">
                            {ruleDescription}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

        </div>
      </div>

      {/* Edit Subscriber Dialog */}
      <Dialog open={!!editingSubscriber} onOpenChange={(open) => !open && setEditingSubscriber(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subscriber</DialogTitle>
            <DialogDescription>
              Update tags and status for {editingSubscriber?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                  <SelectItem value="complained">Complained</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2 flex-wrap mb-2">
                {editTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button 
                      type="button" 
                      onClick={() => removeEditTag(tag)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {editTags.length === 0 && (
                  <span className="text-sm text-muted-foreground">No tags</span>
                )}
              </div>
              
              <div className="flex gap-2">
                <Input 
                  placeholder="Add a tag..." 
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEditTag())}
                  data-testid="input-add-tag"
                />
                <Button type="button" variant="outline" onClick={addEditTag}>Add</Button>
              </div>
              
              {allTags.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground mb-1">Existing tags:</p>
                  <div className="flex gap-1 flex-wrap">
                    {allTags.filter(t => !editTags.includes(t)).map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="outline" 
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => setEditTags([...editTags, tag])}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSubscriber(null)}>Cancel</Button>
            <Button 
              onClick={handleSaveSubscriber} 
              disabled={updateMutation.isPending}
              data-testid="button-save-subscriber-changes"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for tag actions from Manage Tags */}
      <AlertDialog open={!!tagToDelete && !!deleteTagAction} onOpenChange={(open) => { if (!open) { setTagToDelete(null); setDeleteTagAction(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {deleteTagAction === 'subscribers' ? 'Delete Subscribers by Tag' : 'Remove Tag'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTagAction === 'subscribers' 
                ? <>This will permanently delete <strong>all subscribers</strong> who have the tag "{tagToDelete}". This action cannot be undone.</>
                : <>This will remove the tag "{tagToDelete}" from all subscribers. The subscribers themselves will not be deleted.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (tagToDelete) {
                  if (deleteTagAction === 'subscribers') {
                    deleteSubscribersByTagMutation.mutate(tagToDelete);
                  } else {
                    removeTagMutation.mutate(tagToDelete);
                  }
                }
              }}
              className={deleteTagAction === 'subscribers' ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600"}
              disabled={deleteSubscribersByTagMutation.isPending || removeTagMutation.isPending}
            >
              {(deleteSubscribersByTagMutation.isPending || removeTagMutation.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              {deleteTagAction === 'subscribers' ? 'Delete Subscribers' : 'Remove Tag'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
