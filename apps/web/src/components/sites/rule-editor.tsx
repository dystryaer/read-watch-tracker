"use client";

import "@/lib/zod-locale";
import { useMemo, useState } from "react";
import { saveRuleAction } from "@/app/(app)/settings/sites/actions";
import { ActionForm } from "@/components/action-form";
import { evaluateRule, RULE_FIELDS, type RuleField, type RuleFields } from "@/lib/rule-test";

const LABELS: Record<RuleField, { label: string; hint: string; placeholder: string }> = {
  chapterPattern: { label: "Kapitel-Muster", hint: "Regex auf den URL-Pfad, Gruppe 1 = Kapitelnummer", placeholder: String.raw`/chapter/(\d+(?:\.\d+)?)` },
  seriesPattern: { label: "Serien-Muster", hint: "Regex auf den URL-Pfad, Gruppe 1 = Serienschlüssel", placeholder: String.raw`/series/([^/]+)` },
  titleSelector: { label: "Titel-Selektor", hint: "CSS-Selektor für den Serientitel", placeholder: "h1.series-title" },
  endSelector: { label: "Kapitelende-Selektor", hint: "CSS-Selektor, der am Kapitelende sichtbar wird", placeholder: "a.next-chapter" },
  nextUrlTemplate: { label: "Weiterlesen-Vorlage", hint: "Platzhalter: {origin}, {seriesUrl}, {series}, {next}", placeholder: "{seriesUrl}/chapter/{next}" },
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function RuleEditor({
  siteKey,
  domains,
  initial,
  sampleUrls,
}: {
  siteKey: string;
  domains: string[];
  initial: RuleFields;
  sampleUrls: string[];
}) {
  const [fields, setFields] = useState<RuleFields>(initial);
  const [samples, setSamples] = useState(sampleUrls.join("\n"));
  const evaluation = useMemo(() => evaluateRule(fields, { sourceKey: siteKey, domains }, samples), [fields, siteKey, domains, samples]);

  return (
    <div className="space-y-5">
      <ActionForm action={saveRuleAction} submitLabel="Regel speichern">
        <input type="hidden" name="siteKey" value={siteKey} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Leere Felder bedeuten: generische Erkennung für diesen Schritt.</p>
        {RULE_FIELDS.map((field) => {
          const error = evaluation.errors[field];
          return (
            <label key={field} className="block space-y-1 text-sm">
              <span className="font-medium">{LABELS[field].label}</span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{LABELS[field].hint}</span>
              <input
                name={field}
                value={fields[field] ?? ""}
                onChange={(event) => setFields((current) => ({ ...current, [field]: event.target.value }))}
                placeholder={LABELS[field].placeholder}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                className={`${inputClass} ${error ? "border-red-600" : ""}`}
              />
              {error ? <span className="block text-xs text-red-700 dark:text-red-400">{error}</span> : null}
            </label>
          );
        })}
      </ActionForm>

      <section aria-labelledby="live-test">
        <h3 id="live-test" className="mb-1 text-sm font-semibold">
          Live-Test {evaluation.usesRule ? "(mit dieser Regel)" : "(generische Erkennung)"}
        </h3>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Eine URL pro Zeile, optional „URL | Seitentitel“</span>
          <textarea
            value={samples}
            onChange={(event) => setSamples(event.target.value)}
            rows={4}
            spellCheck={false}
            className={inputClass}
          />
        </label>
        {evaluation.results.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">URL</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Kapitel</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Serienschlüssel</th>
                  <th scope="col" className="py-1 font-medium">Weiterlesen</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.results.map((result, index) => (
                  <tr key={`${index}:${result.url}`} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="max-w-64 truncate py-1 pr-3 font-mono" title={result.url}>{result.url}</td>
                    <td className="py-1 pr-3">{result.detection ? result.detection.chapter : "nicht erkannt"}</td>
                    <td className="py-1 pr-3 font-mono">{result.detection?.seriesKey ?? "–"}</td>
                    <td className="max-w-64 truncate py-1 font-mono" title={result.next ?? ""}>{result.next ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
