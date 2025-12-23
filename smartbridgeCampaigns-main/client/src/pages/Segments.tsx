import { useState, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Trash2, Pencil, Loader2, Filter, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Segment } from "@shared/schema";

interface SegmentRules {
  type: 'all' | 'tags_any' | 'tags_all';
  tags?: string[];
}

export default function Segments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<(Segment & { count: number }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleType, setRuleType] = useState<'all' | 'tags_any' | 'tags_all'>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: segments = [], isLoading } = useQuery({
    queryKey: ["segments"],
    queryFn: api.segments.getAll,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: api.tags.getAll,
  });

  const createMutation = useMutation({
    mutationFn: api.segments.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast({ title: "Segment Created", description: "Your new segment has been created." });
      resetForm();
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Segment> }) => api.segments.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast({ title: "Segment Updated", description: "Your segment has been updated." });
      resetForm();
      setEditingSegment(null);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.segments.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["segments"] });
      toast({ title: "Segment Deleted", description: "The segment has been deleted." });
      setDeleteDialogOpen(false);
      setSegmentToDelete(null);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setRuleType("all");
    setSelectedTags([]);
    setNewTag("");
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a segment name" });
      return;
    }
    
    const rules: SegmentRules = { type: ruleType };
    if (ruleType !== 'all') {
      rules.tags = selectedTags;
    }

    createMutation.mutate({ name, description, rules });
  };

  const handleUpdate = () => {
    if (!editingSegment || !name.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a segment name" });
      return;
    }
    
    const rules: SegmentRules = { type: ruleType };
    if (ruleType !== 'all') {
      rules.tags = selectedTags;
    }

    updateMutation.mutate({ id: editingSegment.id, data: { name, description, rules } });
  };

  const openEditDialog = (segment: Segment & { count: number }) => {
    const rules = segment.rules as SegmentRules;
    setName(segment.name);
    setDescription(segment.description);
    setRuleType(rules.type || 'all');
    setSelectedTags(rules.tags || []);
    setEditingSegment(segment);
  };

  const addTag = () => {
    if (newTag.trim() && !selectedTags.includes(newTag.trim())) {
      setSelectedTags([...selectedTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const selectExistingTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const getRuleDescription = (rules: SegmentRules) => {
    if (rules.type === 'all') return 'All active subscribers';
    if (rules.type === 'tags_any') return `Has any of: ${rules.tags?.join(', ') || 'none'}`;
    if (rules.type === 'tags_all') return `Has all of: ${rules.tags?.join(', ') || 'none'}`;
    return 'Unknown rule';
  };

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const query = searchQuery.toLowerCase();
    return segments.filter(segment => 
      segment.name.toLowerCase().includes(query) ||
      segment.description.toLowerCase().includes(query) ||
      (segment.rules as SegmentRules)?.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  }, [segments, searchQuery]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 pl-64 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 font-display" data-testid="text-page-title">
                Segments
              </h1>
              <p className="text-gray-500 mt-1">
                Create audience segments to target specific groups of subscribers.
              </p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2" data-testid="button-create-segment">
                  <Plus className="w-4 h-4" />
                  Create Segment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Segment</DialogTitle>
                  <DialogDescription>
                    Define a new audience segment based on subscriber tags.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Segment Name</Label>
                    <Input 
                      id="name" 
                      placeholder="e.g., Newsletter Subscribers" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="input-segment-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      placeholder="Describe who this segment targets..." 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      data-testid="input-segment-description"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Filter Type</Label>
                    <Select value={ruleType} onValueChange={(v: 'all' | 'tags_any' | 'tags_all') => setRuleType(v)}>
                      <SelectTrigger data-testid="select-rule-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All active subscribers</SelectItem>
                        <SelectItem value="tags_any">Has any of selected tags</SelectItem>
                        <SelectItem value="tags_all">Has all selected tags</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {ruleType !== 'all' && (
                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {selectedTags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button 
                              type="button" 
                              onClick={() => removeTag(tag)}
                              className="ml-1 hover:text-red-500"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Add a tag..." 
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                          data-testid="input-new-tag"
                        />
                        <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                      </div>
                      
                      {allTags.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-gray-500 mb-1">Existing tags:</p>
                          <div className="flex gap-1 flex-wrap">
                            {allTags.filter(t => !selectedTags.includes(t)).map((tag) => (
                              <Badge 
                                key={tag} 
                                variant="outline" 
                                className="cursor-pointer hover:bg-gray-100"
                                onClick={() => selectExistingTag(tag)}
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-confirm-create">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Segment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search bar */}
          {segments.length > 0 && (
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search segments by name, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 max-w-md"
                data-testid="input-search-segments"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : segments.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Filter className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No segments yet</h3>
                <p className="text-gray-500 mb-4">
                  Create your first segment to target specific subscribers.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Segment
                </Button>
              </CardContent>
            </Card>
          ) : filteredSegments.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Search className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No segments found</h3>
                <p className="text-gray-500">
                  No segments match your search criteria.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSegments.map((segment) => (
                <Card key={segment.id} className="overflow-hidden" data-testid={`card-segment-${segment.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg truncate flex-1" title={segment.name}>
                        {segment.name}
                      </CardTitle>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditDialog(segment)}
                          data-testid={`button-edit-segment-${segment.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => { setSegmentToDelete(segment.id); setDeleteDialogOpen(true); }}
                          data-testid={`button-delete-segment-${segment.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="line-clamp-2" title={segment.description}>
                      {segment.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <Users className="w-4 h-4 flex-shrink-0" />
                      <span data-testid={`text-subscriber-count-${segment.id}`}>
                        {segment.count.toLocaleString()} subscriber{segment.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <Badge variant="outline" className="text-xs max-w-full">
                        <span className="truncate block" title={getRuleDescription(segment.rules as SegmentRules)}>
                          {getRuleDescription(segment.rules as SegmentRules)}
                        </span>
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={!!editingSegment} onOpenChange={(open) => { if (!open) { setEditingSegment(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Segment</DialogTitle>
            <DialogDescription>
              Update your segment's targeting rules.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Segment Name</Label>
              <Input 
                id="edit-name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-edit-segment-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea 
                id="edit-description" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="input-edit-segment-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Filter Type</Label>
              <Select value={ruleType} onValueChange={(v: 'all' | 'tags_any' | 'tags_all') => setRuleType(v)}>
                <SelectTrigger data-testid="select-edit-rule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All active subscribers</SelectItem>
                  <SelectItem value="tags_any">Has any of selected tags</SelectItem>
                  <SelectItem value="tags_all">Has all selected tags</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {ruleType !== 'all' && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {selectedTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button 
                        type="button" 
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <Input 
                    placeholder="Add a tag..." 
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    data-testid="input-edit-new-tag"
                  />
                  <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                </div>
                
                {allTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 mb-1">Existing tags:</p>
                    <div className="flex gap-1 flex-wrap">
                      {allTags.filter(t => !selectedTags.includes(t)).map((tag) => (
                        <Badge 
                          key={tag} 
                          variant="outline" 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => selectExistingTag(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingSegment(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-confirm-update">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Segment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this segment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => segmentToDelete && deleteMutation.mutate(segmentToDelete)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
