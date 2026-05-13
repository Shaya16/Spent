"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CompleteStepProps {
  onFinish: () => void;
}

export function CompleteStep({ onFinish }: CompleteStepProps) {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-6 w-6 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <CardTitle>You&apos;re all set!</CardTitle>
        <CardDescription>
          Your finance tracker is ready. Click &quot;Sync Now&quot; on the
          dashboard to pull your first transactions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={onFinish}>
          Go to Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
