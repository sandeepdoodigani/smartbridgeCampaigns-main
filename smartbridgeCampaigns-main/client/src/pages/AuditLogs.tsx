import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api, type AuditLog } from "@/lib/api";
import { format } from "date-fns";
import { 
  Search, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Globe,
  FileText
} from "lucide-react";

const categoryColors: Record<string, string> = {
  auth: "bg-blue-100 text-blue-800",
  campaign: "bg-purple-100 text-purple-800",
  subscriber: "bg-green-100 text-green-800",
  segment: "bg-orange-100 text-orange-800",
  settings: "bg-yellow-100 text-yellow-800",
  webhook: "bg-pink-100 text-pink-800",
  system: "bg-gray-100 text-gray-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  failure: <XCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
};

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", page, debouncedSearch, category, status, startDate, endDate],
    queryFn: () => api.auditLogs.list({
      page,
      limit: 25,
      search: debouncedSearch || undefined,
      category,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const { data: filters } = useQuery({
    queryKey: ["audit-log-filters"],
    queryFn: api.auditLogs.getFilters,
  });

  const handleExport = () => {
    const url = api.auditLogs.exportUrl({
      category,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    window.open(url, '_blank');
  };

  const clearFilters = () => {
    setSearch("");
    setCategory(undefined);
    setStatus(undefined);
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const formatAction = (action: string): string => {
    return action
      .split('.')
      .map(part => part.replace(/_/g, ' '))
      .join(' > ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <Shield className="h-8 w-8 text-indigo-600" />
                Audit Logs
              </h1>
              <p className="text-gray-500 mt-1">Track all actions and events in your account</p>
            </div>
            <Button 
              onClick={handleExport}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-export"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                
                <Select value={category || "all"} onValueChange={(v) => { setCategory(v === "all" ? undefined : v); setPage(1); }}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {filters?.categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  placeholder="Start Date"
                  data-testid="input-start-date"
                />

                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  placeholder="End Date"
                  data-testid="input-end-date"
                />
              </div>

              {(search || category || status || startDate || endDate) && (
                <div className="mt-4">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    Clear all filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Activity Log</CardTitle>
                  <CardDescription>
                    {logs?.total ? `Showing ${((page - 1) * 25) + 1}-${Math.min(page * 25, logs.total)} of ${logs.total.toLocaleString()} entries` : 'No entries found'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : logs?.logs.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No audit logs found</p>
                  <p className="text-gray-400 text-sm">Activity will appear here as you use the application</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs?.logs.map((log) => (
                    <div 
                      key={log.id} 
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {statusIcons[log.status] || statusIcons.success}
                            <span className="font-medium text-gray-900">{log.description}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <Badge variant="secondary" className={categoryColors[log.category] || categoryColors.system}>
                              {log.category}
                            </Badge>
                            <span className="text-gray-400">|</span>
                            <span>{formatAction(log.action)}</span>
                            {log.resourceType && log.resourceId && (
                              <>
                                <span className="text-gray-400">|</span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                  {log.resourceType}: {log.resourceId.substring(0, 8)}...
                                </span>
                              </>
                            )}
                          </div>
                          {log.errorMessage && (
                            <p className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded">
                              {log.errorMessage}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm text-gray-500 flex-shrink-0">
                          <div className="flex items-center gap-1 mb-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                          </div>
                          {log.ipAddress && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Globe className="h-3 w-3" />
                              {log.ipAddress}
                            </div>
                          )}
                          {log.duration && (
                            <div className="text-xs text-gray-400 mt-1">
                              {log.duration}ms
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {logs && logs.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <p className="text-sm text-gray-500">
                    Page {logs.page} of {logs.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page >= logs.totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
