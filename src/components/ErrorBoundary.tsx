import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[LifeOS ErrorBoundary caught an unhandled exception]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    try {
      const keysToClear = [
        "pulse_fitness_matrix_plans",
        "pulse_matrix_plans",
        "pulse_training_programs",
        "pulse_active_program_id",
        "pulse_last_synced_state"
      ];
      keysToClear.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      });
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("pulse_guest_matrix_plans") || k.startsWith("pulse_guest_active_program_id")) {
          try {
            localStorage.removeItem(k);
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn("Notice clearing local state:", e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#ECECEB] text-[#222222] flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-black/[0.08] text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-[#AD314D] border border-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-[#222222]">Something went wrong</h1>
              <p className="text-xs text-neutral-600 leading-relaxed">
                An unexpected interface error occurred. You can reload the application or reset cached workout program state to recover cleanly.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-neutral-50 border border-black/[0.06] text-left">
                <p className="text-[11px] font-mono text-neutral-700 break-words line-clamp-3">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#AD314D] hover:bg-[#92263F] text-white font-bold text-xs shadow-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetState}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs transition-colors"
              >
                <Trash2 className="w-4 h-4 text-neutral-500" />
                <span>Reset Program Cache & Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
