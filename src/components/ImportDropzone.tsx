import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImportDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED = [".xml", ".pdf"];

function filterAccepted(files: File[]): File[] {
  return files.filter((f) => ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext)));
}

export default function ImportDropzone({ onFiles, disabled }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const emit = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted = filterAccepted(Array.from(fileList));
    if (accepted.length > 0) onFiles(accepted);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    emit(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <p className="text-sm text-muted-foreground">
        Arraste arquivos <strong>.xml</strong> ou <strong>.pdf</strong> de notas fiscais aqui
      </p>
      <p className="text-xs text-muted-foreground">ou</p>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />
      <Button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Selecionar arquivos
      </Button>
    </div>
  );
}
