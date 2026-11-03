"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDirectory } from "@/hooks/use-directory";

/** Phones start on the inbox; desktop opens the workspace's home channel. */
export function OpenWorkspace() {
  const router = useRouter();
  const dir = useDirectory();
  useEffect(() => {
    router.replace(window.matchMedia("(min-width: 768px)").matches ? `/chat/${dir.home}` : "/home");
  }, [router, dir.home]);
  return null;
}
