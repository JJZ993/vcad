import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useDocumentStore } from "@/stores/document-store";

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
      } = useUiStore.getState();
      const {
        undo,
        redo,
        removePart,
        duplicateParts,
        applyBoolean,
      } = useDocumentStore.getState();

      const mod = e.ctrlKey || e.metaKey;

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
        if (selectedPartIds.size > 0) {
          e.preventDefault();
          copyToClipboard(Array.from(selectedPartIds));
        }
        return;
      }

      // Paste: Ctrl/Cmd+V
      if (mod && !e.shiftKey && e.key === "v") {
        const { clipboard } = useUiStore.getState();
        if (clipboard.length > 0) {
          e.preventDefault();
          const newIds = duplicateParts(clipboard);
          useUiStore.getState().selectMultiple(newIds);
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
        for (const id of selectedPartIds) {
          removePart(id);
        }
        clearSelection();
        return;
      }

      // Escape: deselect
      if (e.key === "Escape") {
        clearSelection();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
