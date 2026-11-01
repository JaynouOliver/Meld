"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Phones start on the inbox; desktop starts in #product-design, like the design. */
export function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(window.matchMedia("(min-width: 768px)").matches ? "/chat/design" : "/home");
  }, [router]);
  return null;
}
