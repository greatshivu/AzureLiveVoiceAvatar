import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Skeleton } from "./ui/skeleton";

export const ResultsTable = ({ prefix, columns, rows, loading }) => {
  return (
    <div
      data-testid={`${prefix}-results-table`}
      className="border border-slate-200 rounded-lg overflow-hidden bg-white"
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={`text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 ${
                  c.align === "right" ? "text-right" : ""
                }`}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-b border-slate-100">
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-slate-400 text-sm">
                No records match your filters.
              </TableCell>
            </TableRow>
          )}

          {!loading &&
            rows.map((row, idx) => (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.3) }}
                data-testid={`${prefix}-row-${row.id}`}
                className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0"
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={`text-sm text-slate-700 py-3 ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </TableCell>
                ))}
              </motion.tr>
            ))}
        </TableBody>
      </Table>
    </div>
  );
};
