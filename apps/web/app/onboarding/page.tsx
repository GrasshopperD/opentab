import { Suspense } from "react";
import { Onboarding } from "../experience/onboarding";

export default function OnboardingPage() {
  return <Suspense fallback={<div className="ot-loading" role="status">Opening your next chapter…</div>}><Onboarding /></Suspense>;
}
