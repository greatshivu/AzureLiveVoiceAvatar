import { format } from "date-fns";
import { MagnifyingGlass, CalendarBlank, FunnelSimple, ArrowClockwise } from "@phosphor-icons/react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

const fieldLabel = "text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5 block";

export const FilterBar = ({
  prefix,
  search,
  onSearchChange,
  searchPlaceholder,
  selectLabel,
  selectValue,
  onSelectChange,
  selectOptions,
  radioLabel,
  radioValue,
  onRadioChange,
  radioOptions,
  checkboxLabel,
  checkboxChecked,
  onCheckboxChange,
  range,
  onRangeChange,
  onSearch,
  onReset,
}) => {
  return (
    <div
      data-testid={`${prefix}-filter-bar`}
      className="bg-white border border-slate-200 rounded-lg p-5 mb-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Text search */}
        <div className="lg:col-span-2">
          <Label className={fieldLabel}>Keyword</Label>
          <div className="relative">
            <MagnifyingGlass
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              data-testid={`${prefix}-search-input`}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder={searchPlaceholder}
              className="pl-10 border-slate-200"
            />
          </div>
        </div>

        {/* Dropdown */}
        <div>
          <Label className={fieldLabel}>{selectLabel}</Label>
          <Select value={selectValue} onValueChange={onSelectChange}>
            <SelectTrigger data-testid={`${prefix}-select-trigger`} className="border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {selectOptions.map((o) => (
                <SelectItem key={o} value={o} data-testid={`${prefix}-select-${o}`}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date range */}
        <div>
          <Label className={fieldLabel}>Date Range</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                data-testid={`${prefix}-date-trigger`}
                className="w-full justify-start font-normal border-slate-200 text-slate-700"
              >
                <CalendarBlank size={16} className="mr-2 text-slate-400" />
                {range?.from ? (
                  range.to ? (
                    <span className="truncate">
                      {format(range.from, "MMM d")} – {format(range.to, "MMM d, yy")}
                    </span>
                  ) : (
                    format(range.from, "MMM d, yy")
                  )
                ) : (
                  <span className="text-slate-400">Any date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={onRangeChange}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Second row: radio + checkbox + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-6 mt-5 pt-5 border-t border-slate-100">
        <div>
          <Label className={fieldLabel}>{radioLabel}</Label>
          <RadioGroup
            value={radioValue}
            onValueChange={onRadioChange}
            className="flex items-center gap-4"
            data-testid={`${prefix}-radio-group`}
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="all" id={`${prefix}-radio-all`} data-testid={`${prefix}-radio-all`} />
              <Label htmlFor={`${prefix}-radio-all`} className="text-sm text-slate-600 cursor-pointer">
                All
              </Label>
            </div>
            {radioOptions.map((o) => (
              <div className="flex items-center gap-1.5" key={o}>
                <RadioGroupItem value={o} id={`${prefix}-radio-${o}`} data-testid={`${prefix}-radio-${o}`} />
                <Label htmlFor={`${prefix}-radio-${o}`} className="text-sm text-slate-600 cursor-pointer">
                  {o}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="flex items-center gap-2 lg:pt-5">
          <Checkbox
            id={`${prefix}-checkbox`}
            checked={checkboxChecked}
            onCheckedChange={onCheckboxChange}
            data-testid={`${prefix}-checkbox`}
          />
          <Label htmlFor={`${prefix}-checkbox`} className="text-sm text-slate-600 cursor-pointer">
            {checkboxLabel}
          </Label>
        </div>

        <div className="flex items-center gap-2 lg:ml-auto lg:pt-5">
          <Button
            variant="ghost"
            onClick={onReset}
            data-testid={`${prefix}-reset-btn`}
            className="text-slate-500 hover:text-slate-900"
          >
            <ArrowClockwise size={16} className="mr-1.5" />
            Reset
          </Button>
          <Button
            onClick={onSearch}
            data-testid={`${prefix}-search-btn`}
            className="bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition-transform"
          >
            <FunnelSimple size={16} className="mr-1.5" weight="bold" />
            Search Records
          </Button>
        </div>
      </div>
    </div>
  );
};
