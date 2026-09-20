import { useRef, useState } from "react";

interface Props {
  pgnText: string;
  onChange: (text: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  onAnalyze: () => void;
  disabled: boolean;
}

export function PgnInput({ pgnText, onChange, depth, onDepthChange, onAnalyze, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function loadFile(file: File) {
    onChange(await file.text());
  }

  return (
    <div className="pgn-input">
      <div
        className={`dropzone${dragOver ? " dropzone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <p>Drop a .pgn file here, or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pgn,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
      </div>

      <p className="or-divider">or paste PGN text</p>

      <textarea
        className="pgn-textarea"
        placeholder={'[Event "..."]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 ...'}
        value={pgnText}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
      />

      <div className="pgn-controls">
        <label>
          Engine depth
          <select value={depth} onChange={(e) => onDepthChange(Number(e.target.value))}>
            <option value={10}>10 (fast)</option>
            <option value={14}>14 (balanced)</option>
            <option value={18}>18 (deep, slower)</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={onAnalyze} disabled={disabled || pgnText.trim().length === 0}>
          Analyze Game
        </button>
      </div>
    </div>
  );
}
