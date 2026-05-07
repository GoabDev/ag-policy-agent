import { Suspense } from "react";
import HistoryLogsPage from "@/components/dashboard/HistoryLogsPage";
import { Loader2 } from "lucide-react";

function HistoryPageFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1200px] items-center justify-center p-6 md:p-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history...
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<HistoryPageFallback />}>
      <HistoryLogsPage />
    </Suspense>
  );
}
