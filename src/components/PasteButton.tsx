import { Check, ClipboardPaste } from "lucide-react";
import { useState, type MouseEvent } from "react";

interface Props {
  label: string;
  onPaste: (value: string) => void;
}

export function PasteButton({ label, onPaste }: Props) {
  const [pasted, setPasted] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handlePaste(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setFailed(false);

    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard API indisponível");
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) return;
      onPaste(value);
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1400);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2200);
    }
  }

  return <button
    type="button"
    className="paste-number-button"
    aria-label={label}
    title={failed ? "Permita o acesso à área de transferência para colar" : pasted ? "Colado" : label}
    onClick={handlePaste}
  >
    {pasted ? <Check size={18} /> : <ClipboardPaste size={18} />}
  </button>;
}
