import { useEffect } from "react";
import { useUiStore, useDocumentStore, useSketchStore } from "@vcad/core";
import { useToastStore } from "../stores/toast-store";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const {
        selectedPartIds,
        clearSelection,
        setTransformMode,
        toggleWireframe,
        toggleGridSnap,
        copyToClipboard,
        toggleCommandPalette,
        toggleFeatureTree,
      } = useUiStore.getState();
      const {
        undo,
        redo,
        removePart,
        duplicateParts,
        applyBoolean,
      } = useDocumentStore.getState();

      const mod = e.ctrlKey || e.metaKey;

      // Command palette: Cmd+K
      if (mod && e.key === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Toggle feature tree: backtick or Cmd+1
      if (e.key === "`" || (mod && e.key === "1")) {
        e.preventDefault();
        toggleFeatureTree();
        return;
      }

      // Undo: Ctrl/Cmd+Z
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl/Cmd+Shift+Z
      if (mod && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
        return;
      }

      // Duplicate: Ctrl/Cmd+D
      if (mod && !e.shiftKey && e.key === "d") {
        e.preventDefault();
        if (selectedPartIds.size > 0) {
          const ids = Array.from(selectedPartIds);
          const newIds = duplicateParts(ids);
          useUiStore.getState().selectMultiple(newIds);
        }
        return;
      }

      // Copy: Ctrl/Cmd+C
      if (mod && !e.shiftKey && e.key === "c") {
        e.preventDefault();
        if (selectedPartIds.size === 0) {
          useToastStore.getState().addToast("Nothing to copy", "info");
          return;
        }
        copyToClipboard(Array.from(selectedPartIds));
        const count = selectedPartIds.size;
        useToastStore
          .getState()
          .addToast(`Copied ${count} part${count > 1 ? "s" : ""}`, "success");
        return;
      }

      // Paste: Ctrl/Cmd+V
      if (mod && !e.shiftKey && e.key === "v") {
        const { clipboard } = useUiStore.getState();
        if (clipboard.length > 0) {
          e.preventDefault();
          const newIds = duplicateParts(clipboard);
          useUiStore.getState().selectMultiple(newIds);
          const count = newIds.length;
          useToastStore
            .getState()
            .addToast(
              `Pasted ${count} part${count > 1 ? "s" : ""}`,
              "success"
            );
        }
        return;
      }

      // Save: Ctrl/Cmd+S
      if (mod && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        // Dispatched as custom event, handled by App.tsx
        window.dispatchEvent(new CustomEvent("vcad:save"));
        return;
      }

      // Open: Ctrl/Cmd+O
      if (mod && !e.shiftKey && e.key === "o") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("vcad:open"));
        return;
      }

      // Boolean shortcuts (2 selected)
      if (mod && e.shiftKey && selectedPartIds.size === 2) {
        const ids = Array.from(selectedPartIds);
        const keyLower = e.key.toLowerCase();
        if (keyLower === "u") {
          e.preventDefault();
          const newId = applyBoolean("union", ids[0]!, ids[1]!);
          if (newId) useUiStore.getState().select(newId);
          return;
        }
        if (keyLower === "d") {
          e.preventDefault();
          const newId = applyBoolean("difference", ids[0]!, ids[1]!);
          if (newId) useUiStore.getState().select(newId);
          return;
        }
        if (keyLower === "i") {
          e.preventDefault();
          const newId = applyBoolean("intersection", ids[0]!, ids[1]!);
          if (newId) useUiStore.getState().select(newId);
          return;
        }
      }

      // Transform modes
      if (e.key === "w" || e.key === "W") {
        setTransformMode("translate");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        setTransformMode("rotate");
        return;
      }
      if (e.key === "r" || e.key === "R") {
        setTransformMode("scale");
        return;
      }

      // Toggle wireframe
      if (e.key === "x" || e.key === "X") {
        toggleWireframe();
        return;
      }

      // Toggle grid snap
      if (e.key === "g" || e.key === "G") {
        toggleGridSnap();
        return;
      }

      // Enter sketch mode: S
      if (e.key === "s" || e.key === "S") {
        const { active, faceSelectionMode } = useSketchStore.getState();
        if (!active && !faceSelectionMode) {
          const hasParts = useDocumentStore.getState().parts.length > 0;
          if (hasParts) {
            // Has parts - enter face selection mode first
            useSketchStore.getState().enterFaceSelectionMode();
          } else {
            // No parts - go directly to XY plane sketch
            useSketchStore.getState().enterSketchMode("XY");
          }
        }
        return;
      }

      // Quick extrude: E (when in sketch mode with segments)
      if ((e.key === "e" || e.key === "E") && !mod) {
        const { active, segments } = useSketchStore.getState();
        if (active && segments.length > 0) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("vcad:sketch-extrude"));
          return;
        }
      }

      // Focus camera on selection
      if (e.key === "f" || e.key === "F") {
        if (selectedPartIds.size > 0) {
          window.dispatchEvent(new CustomEvent("vcad:focus-selection"));
        }
        return;
      }

      // Delete selected
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedPartIds.size > 0
      ) {
        e.preventDefault();
        const ids = Array.from(selectedPartIds);
        // Shift+Delete skips confirmation (power user fast delete)
        if (e.shiftKey) {
          for (const id of ids) {
            removePart(id);
          }
          clearSelection();
        } else {
          useUiStore.getState().showDeleteConfirm(ids);
        }
        return;
      }

      // Escape: exit sketch mode, cancel face selection, or deselect
      if (e.key === "Escape") {
        const { active, faceSelectionMode, pendingExit, requestExit, cancelExit, cancelFaceSelection } = useSketchStore.getState();

        // Cancel face selection mode
        if (faceSelectionMode) {
          cancelFaceSelection();
          useToastStore.getState().addToast("Face selection cancelled", "info");
          return;
        }

        if (active) {
          // If confirmation dialog is showing, cancel it
          if (pendingExit) {
            cancelExit();
            return;
          }
          // Request exit - returns true if exited immediately (empty sketch)
          const exited = requestExit();
          if (exited) {
            useToastStore.getState().addToast("Sketch cancelled", "info");
          }
          // If not exited, confirmation dialog will show in SketchToolbar
        } else {
          clearSelection();
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
