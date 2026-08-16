"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui/primitives";
import type { Branding } from "@/lib/branding";

/**
 * Report branding. The logo and signature saved here are embedded into every
 * PDF and Excel export, so a report can go straight to a client without being
 * re-formatted by hand.
 */
export function BrandingForm({
  branding,
  workspaceName,
}: {
  branding: Branding;
  workspaceName: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(branding.logo_data_url);
  const [signaturePreview, setSignaturePreview] = useState(
    branding.signature_data_url,
  );
  const [clearLogo, setClearLogo] = useState(false);
  const [clearSignature, setClearSignature] = useState(false);

  const previewFile = (file: File, set: (value: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => set(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = new FormData(event.currentTarget);
      if (clearLogo) data.set("logo_clear", "1");
      if (clearSignature) data.set("signature_clear", "1");

      const response = await fetch("/api/branding", {
        method: "POST",
        body: data,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save.");

      toast.success("Branding saved. New exports will use it.");
      setClearLogo(false);
      setClearSignature(false);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>
          <PenLine className="h-3.5 w-3.5" />
          Report branding
        </CardTitle>
        <span className="text-[10.5px] text-[var(--nx-text-faint)]">
          applied to PDF and Excel exports
        </span>
      </CardHeader>
      <CardBody className="p-4">
        <form ref={formRef} onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="business_name">Business name</Label>
              <Input
                id="business_name"
                name="business_name"
                defaultValue={branding.business_name ?? ""}
                placeholder={workspaceName}
                maxLength={120}
              />
              <p className="mt-1 text-[10.5px] text-[var(--nx-text-faint)]">
                Printed at the top of every report.
              </p>
            </div>
            <div>
              <Label htmlFor="signatory_name">Signatory name</Label>
              <Input
                id="signatory_name"
                name="signatory_name"
                defaultValue={branding.signatory_name ?? ""}
                placeholder="Tarang Vasoya"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="signatory_title">Signatory title</Label>
              <Input
                id="signatory_title"
                name="signatory_title"
                defaultValue={branding.signatory_title ?? ""}
                placeholder="Project Lead & CEO"
                maxLength={120}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              id="logo"
              label="Business logo"
              hint="PNG or JPEG, up to 400 KB. Shown in the report header."
              preview={clearLogo ? null : logoPreview}
              onSelect={(file) => {
                setClearLogo(false);
                previewFile(file, setLogoPreview);
              }}
              onClear={() => {
                setClearLogo(true);
                setLogoPreview(null);
              }}
            />
            <ImageField
              id="signature"
              label="Authorised signature"
              hint="A transparent PNG works best. Appears above the signatory name."
              preview={clearSignature ? null : signaturePreview}
              onSelect={(file) => {
                setClearSignature(false);
                previewFile(file, setSignaturePreview);
              }}
              onClear={() => {
                setClearSignature(true);
                setSignaturePreview(null);
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save branding"}
            </Button>
            <p className="text-[11px] text-[var(--nx-text-muted)]">
              Existing reports keep their original branding until re-exported.
            </p>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ImageField({
  id,
  label,
  hint,
  preview,
  onSelect,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  preview: string | null;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3 rounded-md border border-dashed border-[var(--nx-border)] p-3">
        <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--nx-inset)]">
          {preview ? (
            // Data URL preview; next/image cannot optimise these, so use img.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${label} preview`}
              className="max-h-14 max-w-24 object-contain"
            />
          ) : (
            <ImageUp className="h-4 w-4 text-[var(--nx-text-faint)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={id}
            name={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSelect(file);
            }}
          />
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              {preview ? "Replace" : "Upload"}
            </Button>
            {preview ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onClear();
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--nx-text-faint)]">
            {hint}
          </p>
        </div>
      </div>
    </div>
  );
}
