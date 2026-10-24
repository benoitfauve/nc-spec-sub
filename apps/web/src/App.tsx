import { useController } from "./controller.ts";
import { ModernView } from "./ui-modern/ModernView.tsx";

export function App() {
  const c = useController();
  return <ModernView c={c} />;
}
