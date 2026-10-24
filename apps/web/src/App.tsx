import { useController } from "./controller.ts";
import { ModernView } from "./ui-modern/ModernView.tsx";
import { LegacyView } from "./ui-legacy/LegacyView.tsx";

export function App() {
  const c = useController();
  return c.view === "legacy" ? <LegacyView c={c} /> : <ModernView c={c} />;
}
