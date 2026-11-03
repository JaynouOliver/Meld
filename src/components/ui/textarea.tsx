import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-base md:text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
