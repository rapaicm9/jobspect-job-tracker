import { Bell, ChartColumn, Columns3, List, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Decorative: every item carries its label, so the icon is never the name. */
  icon: LucideIcon;
}

/**
 * The five destinations, in the order the product reads.
 *
 * Board first because it is where a job search is looked at, and Applications
 * second because it is where one is worked on. Settings last, as everywhere.
 *
 * Data rather than markup so the nav has one definition: a sixth destination
 * would be a line here, and the command palette in a later commit reads the same
 * list rather than repeating it.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/applications", label: "Applications", icon: List },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  // The unread count attaches to this item when Sprint 8 owns reminders. It is
  // a position rather than a component: a badge polling nothing is a client
  // component earning nothing.
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
