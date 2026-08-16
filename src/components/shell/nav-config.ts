import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Compass,
  Database,
  FileText,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  ScrollText,
  Settings,
  ShieldHalf,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** "live" pages are implemented. "planned" pages say so instead of faking content. */
  status: "live" | "planned";
  badge?: string;
  /** Hidden from the sidebar for anyone below admin. */
  adminOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Sidebar structure, taken from PAGE 2 of the product spec. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "live",
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Dashboards", href: "/dashboards", icon: Gauge, status: "planned" },
      { label: "Reports", href: "/reports", icon: FileText, status: "live" },
      { label: "Explore", href: "/explore", icon: Compass, status: "planned" },
      { label: "Cohorts", href: "/cohorts", icon: Users, status: "planned" },
      { label: "Data Studio", href: "/studio", icon: Table2, status: "live" },
    ],
  },
  {
    label: "AI & Insights",
    items: [
      {
        label: "Anomaly Detection",
        href: "/anomalies",
        icon: AlertTriangle,
        status: "live",
      },
      {
        label: "Forecasting",
        href: "/forecasting",
        icon: TrendingUp,
        status: "live",
      },
      {
        label: "Recommendations",
        href: "/recommendations",
        icon: Lightbulb,
        status: "live",
      },
      {
        label: "Ask AI",
        href: "/ask-ai",
        icon: Sparkles,
        status: "live",
        badge: "Beta",
      },
    ],
  },
  {
    label: "Data Management",
    items: [
      { label: "Sources", href: "/datasets", icon: Database, status: "live" },
      { label: "Models", href: "/models", icon: Boxes, status: "planned" },
      {
        label: "Data Quality",
        href: "/data-quality",
        icon: ShieldCheck,
        status: "live",
      },
      {
        label: "Governance",
        href: "/governance",
        icon: ScrollText,
        status: "live",
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Alerts", href: "/alerts", icon: Bell, status: "planned" },
      { label: "Metrics", href: "/metrics", icon: BarChart3, status: "planned" },
      { label: "Settings", href: "/settings", icon: Settings, status: "live" },
      {
        label: "Admin",
        href: "/admin",
        icon: ShieldHalf,
        status: "live",
        adminOnly: true,
      },
    ],
  },
];
