"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { previewCategorize } from "@/lib/api";
import { toast } from "sonner";
import { CategorizeReviewDialog } from "./categorize-review-dialog";
import type { CategorizePreview } from "@/lib/api";

interface CategorizeButtonProps {
  onApplied?: () => void;
}

export function CategorizeButton({ onApplied }: CategorizeButtonProps) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<CategorizePreview | null>(null);

  const mutation = useMutation({
    mutationFn: previewCategorize,
    onSuccess: (data) => {
      if (data.uncategorizedCount === 0) {
        toast.info("Nothing to categorize - every transaction already has a category.");
        return;
      }
      setPreview(data);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Categorization failed", {
        duration: Infinity,
        closeButton: true,
      });
    },
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="gap-1.5"
      >
        {mutation.isPending ? (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        )}
        {mutation.isPending ? "Thinking..." : "Categorize"}
      </Button>

      {preview && (
        <CategorizeReviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onApplied={() => {
            setPreview(null);
            queryClient.invalidateQueries({ queryKey: ["summary"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["categories"] });
            onApplied?.();
          }}
        />
      )}
    </>
  );
}
