import { TooltipProvider } from "@/components/ui/tooltip";
import { VRMViewer } from "./components/VRMViewer";
import { ControlPanel } from "./components/ControlPanel";

export default function App() {
  const isControlPanel = window.location.hash === "#/controls";

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
