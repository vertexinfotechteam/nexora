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
  Settings,
  ShieldHalf,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/plans";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** "live" pages are implemented. "planned" pages say so instead of faking content. */
  status: "live" | "planned";
  badge?: string;
  /** Hidden from the sidebar for anyone below admin. */
  adminOnly?: boolean;
  /**
   * The entitlement this page needs, if any.
   *
   * Drives the padlock in the sidebar. Pages without one are always reachable
   * — reading what you have already produced is never gated.
   */
  feature?: Feature;
  /**
   * One plain sentence, shown on hover.
   *
   * The labels used to be the vocabulary of an analytics vendor — "Cohorts",
   * "Governance", "Models" — which says nothing to someone who just wants to
   * know what a page is for. Labels are now named after the job, and this
   * carries the detail that used to be missing entirely.
   */
  hint: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Sidebar structure.
 *
 * Routes are unchanged — every href is exactly what it was, so links, history
 * and bookmarks all still work. Only the words a person reads have changed.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Start here",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "live",
        hint: "Your headline numbers and what changed recently.",
      },
    ],
  },
  {
    label: "Your analysis",
    items: [
      {
        label: "Reports",
        href: "/reports",
        icon: FileText,
        status: "live",
        hint: "Finished analyses you can download as PDF or Excel.",
      },
      {
        // Was "Data Studio", which sounded like a data tool. It builds
        // invoices and quotes carrying your logo and signature.
        label: "Invoices & Quotes",
        href: "/studio",
        icon: Table2,
        status: "live",
        hint: "Turn pasted details into an invoice or quote with your branding.",
      },
      {
        // Was "Dashboards".
        label: "Saved Views",
        href: "/dashboards",
        icon: Gauge,
        status: "live",
        feature: "saved_views",
        hint: "Pin the charts you check often onto one screen.",
      },
      {
        // Was "Explore".
        label: "Explore Data",
        href: "/explore",
        icon: Compass,
        status: "live",
        feature: "explore",
        hint: "Slice your data by any column without writing SQL.",
      },
      {
        // Was "Cohorts", a term most people have never met.
        label: "Customer Groups",
        href: "/cohorts",
        icon: Users,
        status: "live",
        feature: "customer_groups",
        hint: "Compare groups of customers against each other over time.",
      },
    ],
  },
  {
    label: "What the AI found",
    items: [
      {
        // Was "Anomaly Detection".
        label: "Unusual Activity",
        href: "/anomalies",
        icon: AlertTriangle,
        status: "live",
        hint: "Points in your data that do not fit the usual pattern.",
      },
      {
        // Was "Forecasting".
        label: "What Happens Next",
        href: "/forecasting",
        icon: TrendingUp,
        status: "live",
        hint: "Where your numbers are heading, with an honest error range.",
      },
      {
        // Was "Recommendations".
        label: "Suggested Actions",
        href: "/recommendations",
        icon: Lightbulb,
        status: "live",
        hint: "What to do about what the analysis found.",
      },
      {
        label: "Ask AI",
        href: "/ask-ai",
        icon: Sparkles,
        status: "live",
        badge: "Beta",
        hint: "Ask a question about your data in plain English.",
      },
    ],
  },
  {
    label: "Your data",
    items: [
      {
        // Was "Sources".
        label: "Your Files",
        href: "/datasets",
        icon: Database,
        status: "live",
        hint: "Spreadsheets you have uploaded, and their columns.",
      },
      {
        // Was "Data Quality".
        label: "Data Health",
        href: "/data-quality",
        icon: ShieldCheck,
        status: "live",
        hint: "Missing values, duplicates and outliers found in your files.",
      },
      {
        // Was "Models", which suggests machine learning. It is saved formulas.
        label: "Saved Formulas",
        href: "/models",
        icon: Boxes,
        status: "live",
        feature: "saved_formulas",
        hint: "Reusable calculations you define once and use everywhere.",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Alerts",
        href: "/alerts",
        icon: Bell,
        status: "live",
        feature: "alerts",
        hint: "Get told when a number crosses a line you care about.",
      },
      {
        // Was "Metrics".
        label: "Saved Numbers",
        href: "/metrics",
        icon: BarChart3,
        status: "live",
        feature: "saved_numbers",
        hint: "Agree one definition of a number so everyone reports it the same.",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        status: "live",
        hint: "Your account, plan, logo and signature.",
      },
      {
        label: "Admin",
        href: "/admin",
        icon: ShieldHalf,
        status: "live",
        adminOnly: true,
        hint: "Users, activity and system health for this workspace.",
      },
    ],
  },
];
