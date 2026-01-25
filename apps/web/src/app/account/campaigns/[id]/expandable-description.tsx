"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ExpandableDescriptionProps {
  description: string | null;
  lineClamp?: number;
}

export function ExpandableDescription({
  description,
  lineClamp = 2,
}: ExpandableDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!description) {
    return (
      <p className="text-muted-foreground text-lg">No description provided.</p>
    );
  }

  return (
    <div className="space-y-1">
      <p
        className="text-muted-foreground text-lg"
        style={!isExpanded ? {
          display: "-webkit-box",
          WebkitLineClamp: lineClamp,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        } : undefined}
      >
        {description}
      </p>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? "Show less" : "Show more"}
      </Button>
    </div>
  );
}
