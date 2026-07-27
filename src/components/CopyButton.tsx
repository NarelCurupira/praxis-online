import { Check, Copy } from "lucide-react";
import { useState, type MouseEvent } from "react";

interface Props {
  value: string;
  label?: string;
  className?: string;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function CopyButton({ value, label = "Copiar", className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!value.trim()) return;
    await copyText(value.trim());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <button
    type="button"
    className={`copy-number-button ${className}`.trim()}
    aria-label={`${label}: ${value}`}
    title={copied ? "Copiado" : label}
    disabled={!value.trim()}
    onClick={handleCopy}
  >
    {copied ? <Check size={14} /> : <Copy size={14} />}
  </button>;
}
