import type { Metadata } from "next";

import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Set up your workspace" };

export default function OnboardingPage() {
  return <Onboarding />;
}
