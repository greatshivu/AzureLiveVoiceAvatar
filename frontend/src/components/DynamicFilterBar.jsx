import { format } from "date-fns";
import { MagnifyingGlass, CalendarBlank, FunnelSimple, ArrowClockwise } from "@phosphor-icons/react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

const fieldLabel = "text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5 block";

const TextControl = ({ prefix, c, value, set, onSearch, placeholder }) => (
  <div className="lg:col-span-2">
    <Label className={fieldLabel}>{c.label}</Label>
    <div className="relative">
      <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        data-testid={`${prefix}-${c.id}-input`}
        value={value || ""}
        onChange={(e) => set(c.id, e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        placeholder={placeholder}
        className="pl-10 border-slate-200"
      />
    </div>
  </div>
);

const SelectControl = ({ prefix, c, value, set }) => (
  <div>
    <Label className={fieldLabel}>{c.label}</Label>
    <Select value={value} onValueChange={(v) => set(c.id, v)}>
      <SelectTrigger data-testid={`${prefix}-${c.id}-select`} className="border-slate-200">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {c.options.map((o) => (
          <SelectItem key={o.value} value={o.value} data-testid={`${prefix}-${c.id}-option-${o.value}`}>
            {o.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const DateControl = ({ prefix, c, value, set }) => (
  <div>
    <Label className={fieldLabel}>{c.label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={`${prefix}-${c.id}-date`}
          className="w-full justify-start font-normal border-slate-200 text-slate-700"
        >
          <CalendarBlank size={16} className="mr-2 text-slate-400" />
          {value?.from ? (
            value.to ? (
              <span className="truncate">
                {format(value.from, "MMM d")} – {format(value.to, "MMM d, yy")}
              </span>
            ) : (
              format(value.from, "MMM d, yy")
            )
          ) : (
            <span className="text-slate-400">Any date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={value} onSelect={(v) => set(c.id, v)} numberOfMonths={2} initialFocus />
      </PopoverContent>
    </Popover>
  </div>
);

const RadioControl = ({ prefix, c, value, set }) => (
  <div>
    <Label className={fieldLabel}>{c.label}</Label>
    <RadioGroup value={value} onValueChange={(v) => set(c.id, v)} className="flex items-center gap-4" data-testid={`${prefix}-${c.id}-radio`}>
      <div className="flex items-center gap-1.5">
        <RadioGroupItem value="all" id={`${prefix}-${c.id}-all`} data-testid={`${prefix}-${c.id}-radio-all`} />
        <Label htmlFor={`${prefix}-${c.id}-all`} className="text-sm text-slate-600 cursor-pointer">All</Label>
      </div>
      {c.options.map((o) => (
        <div className="flex items-center gap-1.5" key={o.value}>
          <RadioGroupItem value={o.value} id={`${prefix}-${c.id}-${o.value}`} data-testid={`${prefix}-${c.id}-radio-${o.value}`} />
          <Label htmlFor={`${prefix}-${c.id}-${o.value}`} className="text-sm text-slate-600 cursor-pointer">{o.value}</Label>
        </div>
      ))}
    </RadioGroup>
  </div>
);

const CheckboxControl = ({ prefix, c, value, set }) => (
  <div className="flex items-center gap-2 lg:pt-5">
    <Checkbox id={`${prefix}-${c.id}`} checked={value} onCheckedChange={(v) => set(c.id, !!v)} data-testid={`${prefix}-${c.id}-checkbox`} />
    <Label htmlFor={`${prefix}-${c.id}`} className="text-sm text-slate-600 cursor-pointer">{c.label}</Label>
  </div>
);

export const DynamicFilterBar = ({ page, filters, set, onSearch, onReset }) => {
  const prefix = page.prefix;
  const top = page.controls.filter((c) => ["text", "select", "daterange"].includes(c.type));
  const bottom = page.controls.filter((c) => ["radio", "checkbox"].includes(c.type));

  const renderControl = (c) => {
    const value = filters[c.id];
    switch (c.type) {
      case "text":
        return <TextControl key={c.id} prefix={prefix} c={c} value={value} set={set} onSearch={onSearch} placeholder={page.searchPlaceholder} />;
      case "select":
        return <SelectControl key={c.id} prefix={prefix} c={c} value={value} set={set} />;
      case "daterange":
        return <DateControl key={c.id} prefix={prefix} c={c} value={value} set={set} />;
      case "radio":
        return <RadioControl key={c.id} prefix={prefix} c={c} value={value} set={set} />;
      case "checkbox":
        return <CheckboxControl key={c.id} prefix={prefix} c={c} value={value} set={set} />;
      default:
        return null;
    }
  };

  return (
    <div data-testid={`${prefix}-filter-bar`} className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{top.map(renderControl)}</div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-6 mt-5 pt-5 border-t border-slate-100">
        {bottom.map(renderControl)}
        <div className="flex items-center gap-2 lg:ml-auto lg:pt-5">
          <Button variant="ghost" onClick={onReset} data-testid={`${prefix}-reset-btn`} className="text-slate-500 hover:text-slate-900">
            <ArrowClockwise size={16} className="mr-1.5" />
            Reset
          </Button>
          <Button onClick={onSearch} data-testid={`${prefix}-search-btn`} className="bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition-transform">
            <FunnelSimple size={16} className="mr-1.5" weight="bold" />
            Search Records
          </Button>
        </div>
      </div>
    </div>
  );
};
