import { useRef, useCallback, memo } from "react";
import grapesjs, { Editor } from "grapesjs";
import GjsEditor from "@grapesjs/react";
import grapesjsNewsletterPreset from "grapesjs-preset-newsletter";
import "grapesjs/dist/css/grapes.min.css";

interface EmailBuilderProps {
  initialHtml?: string;
  onChange: (html: string) => void;
  builderKey?: string;
}

function EmailBuilderInner({ initialHtml, onChange, builderKey }: EmailBuilderProps) {
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const initialHtmlRef = useRef(initialHtml);
  const isLoadingContent = useRef(true);

  onChangeRef.current = onChange;
  initialHtmlRef.current = initialHtml;

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    if (isLoadingContent.current) return;
    
    const html = editorRef.current.getHtml();
    const css = editorRef.current.getCss();
    const fullHtml = css ? `<style>${css}</style>${html}` : html;
    onChangeRef.current(fullHtml);
  }, []);

  const onEditor = useCallback((ed: Editor) => {
    editorRef.current = ed;
    isLoadingContent.current = true;

    if (initialHtmlRef.current) {
      ed.setComponents(initialHtmlRef.current);
    }

    requestAnimationFrame(() => {
      isLoadingContent.current = false;
    });

    ed.on("update", emitChange);
    ed.on("component:add", emitChange);
    ed.on("component:remove", emitChange);

    ed.on("destroy", () => {
      ed.off("update", emitChange);
      ed.off("component:add", emitChange);
      ed.off("component:remove", emitChange);
    });
  }, [emitChange]);

  return (
    <div className="email-builder-container" style={{ height: "600px", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
      <GjsEditor
        key={builderKey}
        grapesjs={grapesjs}
        onEditor={onEditor}
        options={{
          height: "100%",
          width: "100%",
          storageManager: false,
          panels: { defaults: [] },
          plugins: [grapesjsNewsletterPreset],
          pluginsOpts: {
            [grapesjsNewsletterPreset as any]: {
              modalLabelImport: "Paste HTML here:",
              modalLabelExport: "Copy HTML:",
              codeViewerTheme: "material",
            },
          },
          deviceManager: {
            devices: [
              { id: "desktop", name: "Desktop", width: "" },
              { id: "tablet", name: "Tablet", width: "768px" },
              { id: "mobile", name: "Mobile", width: "375px" },
            ],
          },
          canvas: {
            styles: [
              "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
            ],
          },
        }}
      />
      <style>{`
        .email-builder-container .gjs-one-bg { background-color: #f8fafc !important; }
        .email-builder-container .gjs-two-color { color: #1e293b !important; }
        .email-builder-container .gjs-three-bg { background-color: #4f46e5 !important; }
        .email-builder-container .gjs-four-color, .email-builder-container .gjs-four-color-h:hover { color: #4f46e5 !important; }
        .email-builder-container .gjs-pn-panel { padding: 8px; }
        .email-builder-container .gjs-block { padding: 8px; min-height: 60px; }
        .email-builder-container .gjs-block__media { height: 36px; }
        .email-builder-container .gjs-pn-views-container { width: 280px; }
        .email-builder-container .gjs-cv-canvas { width: calc(100% - 280px); }
      `}</style>
    </div>
  );
}

export const EmailBuilder = memo(EmailBuilderInner);
