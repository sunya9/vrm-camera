import { TooltipProvider } from "@/components/ui/tooltip";
import { VRMViewer } from "./components/VRMViewer";
import { ControlPanel } from "./components/ControlPanel";
import { CONTROLS_HASH } from "./lib/platform";

export default function App() {
  const isControlPanel = window.location.hash === CONTROLS_HASH;

  if (isControlPanel) {
    return (
      <TooltipProvider>
        <ControlPanel />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <VRMViewer />
    </TooltipProvider>
  );
}
