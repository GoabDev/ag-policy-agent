"use client"

import { useTheme } from "next-themes"
import { Toaster as SileoToaster } from "sileo"

export function Toaster(props: React.ComponentProps<typeof SileoToaster>) {
  const { resolvedTheme } = useTheme()

  return (
    <SileoToaster
      options={{ fill: resolvedTheme === "dark" ? "black" : undefined }}
      {...props}
    />
  )
}
