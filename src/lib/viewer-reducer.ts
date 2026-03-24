import type { FaceTracker } from "./face-tracker";

export interface ViewerState {
  activeTracker: FaceTracker | null;
  vrmUrl: string | null;
  vrmName: string | null;
  showControls: boolean;
  activeExpression: string | null;
  remoteLightTab: boolean;
  vrmLoading: boolean;
  fps: number;
}

export const initialViewerState: ViewerState = {
  activeTracker: null,
  vrmUrl: null,
  vrmName: null,
  showControls: true,
  activeExpression: null,
  remoteLightTab: false,
  vrmLoading: false,
  fps: 0,
};

export type ViewerAction =
  | { type: "setActiveTracker"; tracker: FaceTracker | null }
  | { type: "setVrm"; url: string; name: string }
  | { type: "setVrmLoading"; loading: boolean }
  | { type: "toggleControls" }
  | { type: "setShowControls"; show: boolean }
  | { type: "setActiveExpression"; name: string | null }
  | { type: "setRemoteLightTab"; active: boolean }
  | { type: "setFps"; fps: number };

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case "setActiveTracker":
      return { ...state, activeTracker: action.tracker };
    case "setVrm":
      return { ...state, vrmUrl: action.url, vrmName: action.name };
    case "setVrmLoading":
      return { ...state, vrmLoading: action.loading };
    case "toggleControls":
      return { ...state, showControls: !state.showControls };
    case "setShowControls":
      return { ...state, showControls: action.show };
    case "setActiveExpression":
      return { ...state, activeExpression: action.name };
    case "setRemoteLightTab":
      return { ...state, remoteLightTab: action.active };
    case "setFps":
      return { ...state, fps: action.fps };
  }
}
