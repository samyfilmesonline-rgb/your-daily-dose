import { useRef, useState } from "react";
import { Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import anon01 from "@/assets/avatars/anon-01.png";
import anon02 from "@/assets/avatars/anon-02.png";
import anon03 from "@/assets/avatars/anon-03.png";
import anon04 from "@/assets/avatars/anon-04.png";
import anon05 from "@/assets/avatars/anon-05.png";
import anon06 from "@/assets/avatars/anon-06.png";
import anon07 from "@/assets/avatars/anon-07.png";
import anon08 from "@/assets/avatars/anon-08.png";
import anon09 from "@/assets/avatars/anon-09.png";

export const PRESET_AVATARS = [
  anon01, anon02, anon03, anon04, anon05, anon06, anon07, anon08, anon09,
];

export type AvatarSelection =
  | { type: "preset"; url: string }
  | { type: "upload"; previewUrl: string; base64: string; mime: string }
  | null;

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: AvatarSelection;
  onChange: (v: AvatarSelection) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Imagem precisa ter menos de 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.replace(/^data:[^;]+;base64,/, "");
      onChange({
        type: "upload",
        previewUrl: result,
        base64,
        mime: file.type || "image/png",
      });
    };
    reader.readAsDataURL(file);
  };

  const isUploadSelected = value?.type === "upload";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {PRESET_AVATARS.map((url, i) => {
          const selected = value?.type === "preset" && value.url === url;
          return (
            <button
              type="button"
              key={url}
              onClick={() => onChange({ type: "preset", url })}
              className={cn(
                "relative aspect-square rounded-full overflow-hidden border-2 transition-all",
                "bg-background/40",
                selected
                  ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.7)] scale-[1.04]"
                  : "border-primary/20 hover:border-primary/60 hover:scale-[1.02]"
              )}
              aria-label={`Avatar ${i + 1}`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {selected && (
                <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all font-mono text-xs uppercase tracking-wider",
          isUploadSelected
            ? "border-primary bg-primary/10 text-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
            : "border-dashed border-primary/30 text-muted-foreground hover:border-primary/60 hover:text-primary"
        )}
      >
        {isUploadSelected ? (
          <img
            src={(value as { previewUrl: string }).previewUrl}
            alt="Sua foto"
            className="w-10 h-10 rounded-full object-cover border border-primary/60"
          />
        ) : (
          <span className="w-10 h-10 rounded-full border border-primary/30 flex items-center justify-center">
            <Upload className="w-4 h-4" />
          </span>
        )}
        <span className="flex-1 text-left">
          {isUploadSelected ? "Foto importada · trocar" : "Importar foto do PC ou celular"}
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="text-xs text-destructive font-mono">{error}</p>
      )}
    </div>
  );
}
