import { Badge } from "./ui/badge";

const MAP = {
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Shipped: "bg-blue-50 text-blue-700 border-blue-200",
  Processing: "bg-amber-50 text-amber-700 border-amber-200",
  Pending: "bg-slate-100 text-slate-600 border-slate-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-slate-100 text-slate-600 border-slate-200",
  New: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Used: "bg-slate-100 text-slate-600 border-slate-200",
  Refurbished: "bg-violet-50 text-violet-700 border-violet-200",
};

export const StatusBadge = ({ value }) => (
  <Badge
    variant="outline"
    className={`font-medium rounded-md ${MAP[value] || "bg-slate-100 text-slate-600 border-slate-200"}`}
  >
    {value}
  </Badge>
);
