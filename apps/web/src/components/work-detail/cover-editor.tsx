"use client";

import { useActionState, useEffect, useEffectEvent, useState, useTransition } from "react";
import { coverFromUrlAction, removeCoverAction, siteCoverAction, uploadCoverAction } from "@/app/(app)/works/[id]/actions";
import { ActionForm, type FormState } from "@/components/action-form";

// Pictures are stored at list-thumbnail size times two at most: about 30 KB instead of megabytes.
const MAX_WIDTH = 300;
const MAX_HEIGHT = 450;

/** Makes a picture small in the browser before it is sent; anything it cannot read goes as it is. */
async function shrink(image: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    const webp = await encode("image/webp");
    // Browsers that cannot write WebP hand back PNG, which is large for pictures: JPEG then.
    return webp?.type === "image/webp" ? webp : ((await encode("image/jpeg")) ?? image);
  } catch {
    return image; // the server checks what it gets
  }
}

function imageIn(files: FileList | null | undefined): File | undefined {
  return [...(files ?? [])].find((file) => file.type.startsWith("image/"));
}

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return "error" in state ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {state.error}
    </p>
  ) : (
    <p role="status" className="text-sm text-teal-800 dark:text-teal-300">
      {state.message}
    </p>
  );
}

/**
 * Change a work's picture: choose a file, drop one, paste one anywhere on the page (Strg+V), or
 * load one from its address. "Bild der Seite" brings back what the reading site names.
 */
export function CoverEditor({ workId, hasCover, siteAvailable }: { workId: string; hasCover: boolean; siteAvailable: boolean }) {
  const [state, upload, uploading] = useActionState(uploadCoverAction, null);
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  async function send(image: Blob) {
    const small = await shrink(image);
    const data = new FormData();
    data.set("workId", workId);
    data.set("image", small, "cover");
    startTransition(() => upload(data));
  }

  // Pasted text stays where it is (title, address field); only a pasted picture is taken.
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const image = imageIn(event.clipboardData?.files);
    if (!image) return;
    event.preventDefault();
    void send(image);
  });
  useEffect(() => {
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const workIdField = <input type="hidden" name="workId" value={workId} />;
  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const image = imageIn(event.dataTransfer.files);
          if (image) void send(image);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors ${
          dragging
            ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40"
            : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        }`}
      >
        <label className="cursor-pointer rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white shadow-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700 hover:bg-teal-600">
          Datei auswählen
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const image = imageIn(event.target.files);
              event.target.value = "";
              if (image) void send(image);
            }}
          />
        </label>
        <span className="text-zinc-600 dark:text-zinc-400">
          {uploading ? "Wird gespeichert …" : "oder ein Bild hierher ziehen bzw. mit Strg+V einfügen"}
        </span>
        <Status state={state} />
      </div>

      <ActionForm action={coverFromUrlAction} submitLabel="Von Adresse laden" className="flex flex-wrap items-end gap-3">
        {workIdField}
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          Bildadresse
          <input
            name="url"
            type="url"
            required
            placeholder="https://… (Rechtsklick aufs Cover → Bildadresse kopieren)"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </ActionForm>

      {siteAvailable || hasCover ? (
        <div className="flex flex-wrap gap-3">
          {siteAvailable ? (
            <ActionForm action={siteCoverAction} submitLabel="Bild der Seite verwenden" className="flex flex-wrap items-center gap-3">
              {workIdField}
            </ActionForm>
          ) : null}
          {hasCover ? (
            <ActionForm action={removeCoverAction} submitLabel="Bild entfernen" danger className="flex flex-wrap items-center gap-3">
              {workIdField}
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
