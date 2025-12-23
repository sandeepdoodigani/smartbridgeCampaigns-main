import { 
  TrendingUp, 
  TrendingDown, 
  MailCheck, 
  MousePointerClick, 
  Eye,
  AlertCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ElementType;
  description?: string;
}

function StatsCard({ title, value, change, trend, icon: Icon, description }: StatsCardProps) {
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
                {trend === 'up' ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
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

export function DashboardStats() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Sent"
        value="90,500"
        change="+20.1%"
        trend="up"
        icon={MailCheck}
        description="from last month"
      />
      <StatsCard
        title="Open Rate"
        value="40.8%"
        change="+4.1%"
        trend="up"
        icon={Eye}
        description="vs industry avg"
      />
      <StatsCard
        title="Click Rate"
        value="12.4%"
        change="-1.2%"
        trend="down"
        icon={MousePointerClick}
        description="from last month"
      />
      <StatsCard
        title="Bounce Rate"
        value="0.8%"
        change="+0.1%"
        trend="down"
        icon={AlertCircle}
        description="within healthy range"
      />
    </div>
  );
}
