"use client"

import * as React from "react"
import { format, setMonth, setYear } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface DatePickerProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(
    date || new Date()
  )

  // Generate year options (2020 to 2035)
  const years = React.useMemo(() => {
    const result: number[] = []
    for (let y = 2020; y <= 2035; y++) {
      result.push(y)
    }
    return result
  }, [])

  const handleMonthChange = (monthStr: string) => {
    const monthIndex = parseInt(monthStr, 10)
    setCalendarMonth(setMonth(calendarMonth, monthIndex))
  }

  const handleYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10)
    setCalendarMonth(setYear(calendarMonth, year))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd-MMM-yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex items-center gap-2 px-3 pt-3">
          <Select
            value={calendarMonth.getMonth().toString()}
            onValueChange={handleMonthChange}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {MONTHS.map((month, i) => (
                <SelectItem key={i} value={i.toString()} className="text-xs">
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={calendarMonth.getFullYear().toString()}
            onValueChange={handleYearChange}
          >
            <SelectTrigger className="h-8 text-xs w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()} className="text-xs">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onDateChange(d)
            setOpen(false)
          }}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
        />
      </PopoverContent>
    </Popover>
  )
}
