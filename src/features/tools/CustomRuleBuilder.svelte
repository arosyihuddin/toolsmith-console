<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import { Modal, OptionDropdown } from "$lib/components/ui";
  import type { ToolCustomRule, ToolCustomRuleAction, ToolCustomRuleCondition, ToolCustomRuleOperator, ToolInputField } from "$lib/types";

  interface Props {
    open: boolean;
    title: string;
    initialRule: ToolCustomRule;
    fields?: ToolInputField[];
    oncancel: () => void;
    onsave: (rule: ToolCustomRule) => Promise<boolean> | boolean;
  }
  let { open, title, initialRule, fields = [], oncancel, onsave }: Props = $props();
  let draft = $state<ToolCustomRule>({ version: 1, match: "all", conditions: [], action: "require_approval", fallbackAction: "require_approval" });
  let saving = $state(false);
  let saveError = $state("");
  const operators: { value: ToolCustomRuleOperator; label: string }[] = [
    { value: "equals", label: "sama dengan" },
    { value: "not_equals", label: "tidak sama dengan" },
    { value: "contains", label: "mengandung" },
    { value: "not_contains", label: "tidak mengandung" },
    { value: "starts_with", label: "diawali" },
    { value: "ends_with", label: "diakhiri" },
    { value: "greater_than", label: "lebih besar dari" },
    { value: "less_than", label: "lebih kecil dari" },
    { value: "in", label: "termasuk daftar" },
    { value: "not_in", label: "tidak termasuk daftar" },
    { value: "exists", label: "tersedia" },
    { value: "not_exists", label: "tidak tersedia" },
  ];
  const actions: { value: ToolCustomRuleAction; label: string }[] = [
    { value: "allow", label: "Izinkan" },
    { value: "require_approval", label: "Minta persetujuan" },
    { value: "block", label: "Blokir" },
  ];
  const fieldOptions = $derived([
    { value: "tool.name", label: "Nama tool" },
    { value: "tool.risk", label: "Level risiko" },
    ...fields.map((field) => ({
      value: "args." + field.path,
      label: field.path.split(".").map((part) => part.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toLocaleUpperCase())).join(" › "),
    })),
  ]);
  function fieldFor(fieldPath: string): ToolInputField | undefined {
    return fields.find((field) => "args." + field.path === fieldPath);
  }
  function operatorsFor(fieldPath: string) {
    const field = fieldFor(fieldPath);
    const allowed = field?.type === "number" || field?.type === "integer"
      ? ["equals", "not_equals", "greater_than", "less_than", "in", "not_in", "exists", "not_exists"]
      : field?.type === "boolean"
        ? ["equals", "not_equals", "exists", "not_exists"]
        : field?.type === "object" || field?.type === "array"
          ? ["exists", "not_exists", "equals", "not_equals"]
          : ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in", "not_in", "exists", "not_exists"];
    return operators.filter((operator) => allowed.includes(operator.value));
  }
  function changeField(index: number, fieldPath: string) {
    const available = operatorsFor(fieldPath);
    const current = draft.conditions[index];
    const operator = available.some((item) => item.value === current.operator)
      ? current.operator
      : (available[0]?.value ?? "equals") as ToolCustomRuleOperator;
    const field = fieldFor(fieldPath);
    const value = field?.type === "boolean" ? "true" : field?.enum?.[0] ?? "";
    updateCondition(index, { field: fieldPath, operator, value });
  }
  function copyRule(rule: ToolCustomRule): ToolCustomRule {
    return {
      version: rule.version,
      match: rule.match,
      conditions: rule.conditions.map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: condition.value,
      })),
      action: rule.action,
      fallbackAction: rule.fallbackAction,
    };
  }
  const canSave = $derived(draft.conditions.every((condition) =>
    (condition.field === "tool.name" || condition.field === "tool.risk" || (condition.field.startsWith("args.") && condition.field.length > 5)) &&
    condition.field.trim() === condition.field &&
    (["exists", "not_exists"].includes(condition.operator) || (condition.value ?? "").trim() !== "")
  ));
  $effect(() => {
    if (open) {
      draft = copyRule(initialRule);
      saveError = "";
    }
  });
  function addCondition() {
    if (draft.conditions.length >= 20) return;
    draft = { ...draft, conditions: [...draft.conditions, { field: "tool.risk", operator: "equals", value: "high" }] };
  }
  function updateCondition(index: number, patch: Partial<ToolCustomRuleCondition>) {
    draft = { ...draft, conditions: draft.conditions.map((condition, i) => i === index ? { ...condition, ...patch } : condition) };
  }
  function removeCondition(index: number) {
    draft = { ...draft, conditions: draft.conditions.filter((_, i) => i !== index) };
  }
  async function save() {
    if (!canSave || saving) return;
    saving = true;
    saveError = "";
    try {
      const saved = await onsave(copyRule(draft));
      if (saved === false) {
        saveError = "Aturan gagal disimpan. Periksa pesan error pada halaman Tool permissions, lalu coba lagi.";
        return;
      }
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan aturan.";
    } finally {
      saving = false;
    }
  }
</script>

<Modal {open} {title} description="Kondisi dievaluasi di backend Toolsmith sebelum tool dijalankan." onclose={oncancel} width="max-w-3xl">
  <div class="space-y-5 p-4 sm:p-5">
    <div class="flex flex-col gap-3 rounded-lg border border-line bg-surface-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-medium text-fg">Jika kondisi cocok</p>
        <p class="mt-0.5 text-xs text-fg-subtle">Pilih apakah semua kondisi atau cukup salah satu yang harus cocok.</p>
      </div>
      <OptionDropdown label="Mode pencocokan kondisi" class="w-full sm:w-56" width="trigger" value={draft.match} options={[{ value: "all", label: "Semua kondisi (AND)" }, { value: "any", label: "Salah satu kondisi (OR)" }]} onchange={(value) => draft = { ...draft, match: value as "all" | "any" }} />
    </div>

    <div class="space-y-3">
      {#each draft.conditions as condition, index (index)}
        <div class="rounded-lg border border-line p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-fg-subtle">Kondisi {index + 1}</span>
            <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-subtle hover:bg-surface-hover hover:text-danger" aria-label={"Hapus kondisi " + (index + 1)} onclick={() => removeCondition(index)}><Trash2 size={13} /> Hapus</button>
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label class="min-w-0 text-xs text-fg-subtle">Parameter
              <OptionDropdown label={"Parameter kondisi " + (index + 1)} class="mt-1 w-full" width="trigger" value={condition.field} options={fieldOptions} onchange={(value) => changeField(index, value)} />
            </label>
            <label class="min-w-0 text-xs text-fg-subtle">Operator
              <OptionDropdown label={"Operator kondisi " + (index + 1)} class="mt-1 w-full" width="trigger" value={condition.operator} options={operatorsFor(condition.field)} onchange={(value) => updateCondition(index, { operator: value })} />
            </label>
            {#if !["exists", "not_exists"].includes(condition.operator)}
              <label class="min-w-0 text-xs text-fg-subtle">Nilai
                {#if fieldFor(condition.field)?.type === "boolean"}
                  <OptionDropdown label={"Nilai kondisi " + (index + 1)} class="mt-1 w-full" width="trigger" value={condition.value ?? "true"} options={[{ value: "true", label: "Ya" }, { value: "false", label: "Tidak" }]} onchange={(value) => updateCondition(index, { value })} />
                {:else if fieldFor(condition.field)?.type === "enum" && fieldFor(condition.field)?.enum?.length}
                  <OptionDropdown label={"Nilai kondisi " + (index + 1)} class="mt-1 w-full" width="trigger" value={condition.value ?? fieldFor(condition.field)?.enum?.[0] ?? ""} options={(fieldFor(condition.field)?.enum ?? []).map((value) => ({ value, label: value.replace(/[_-]+/g, " ") }))} onchange={(value) => updateCondition(index, { value })} />
                {:else}
                  <input type={["number", "integer"].includes(fieldFor(condition.field)?.type ?? "") ? "number" : "text"} class="mt-1 min-h-9 w-full rounded-md border border-line bg-surface-raised px-2.5 text-sm text-fg" value={condition.value ?? ""} placeholder={condition.operator === "in" || condition.operator === "not_in" ? "Pisahkan beberapa nilai dengan koma" : "Masukkan nilai"} oninput={(event) => updateCondition(index, { value: event.currentTarget.value })} />
                {/if}
              </label>
            {:else}
              <div class="flex items-end pb-2 text-xs text-fg-faint">Operator ini tidak memerlukan nilai</div>
            {/if}
          </div>
          <p class="mt-2 text-[11px] text-fg-faint">Pilih parameter yang ingin diperiksa, lalu tentukan operator dan nilainya.</p>
        </div>
      {/each}
      <button type="button" disabled={draft.conditions.length >= 20} class="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40" onclick={addCondition}><Plus size={15} /> Tambah kondisi</button>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="text-sm text-fg-subtle">Aksi jika cocok
        <OptionDropdown label="Aksi jika cocok" class="mt-1.5 min-h-10 w-full" width="trigger" placement="auto" offsetX={-2} value={draft.action} options={actions} onchange={(value) => draft = { ...draft, action: value }} />
      </label>
      <label class="text-sm text-fg-subtle">Aksi jika tidak cocok
        <OptionDropdown label="Aksi jika tidak cocok" class="mt-1.5 min-h-10 w-full" width="trigger" placement="auto" offsetX={-2} value={draft.fallbackAction} options={actions} onchange={(value) => draft = { ...draft, fallbackAction: value }} />
      </label>
    </div>
      {#if !canSave}<p class="px-4 pb-2 text-xs text-danger">Lengkapi parameter dan nilai pada setiap kondisi. Operator “tersedia” dan “tidak tersedia” tidak membutuhkan nilai.</p>{/if}
      {#if saveError}<p class="px-4 pb-2 text-xs text-danger" role="alert">{saveError}</p>{/if}
    </div>
  {#snippet footer()}
    <button type="button" class="min-h-9 rounded-md px-3 text-sm text-fg-subtle hover:bg-surface-hover" onclick={oncancel}>Batal</button>
    <button type="button" disabled={!canSave || saving} aria-disabled={!canSave || saving} title={!canSave ? "Lengkapi kondisi terlebih dahulu" : saving ? "Menyimpan aturan…" : "Simpan aturan"} class="min-h-9 rounded-md bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" onclick={(event) => { event.preventDefault(); event.stopPropagation(); void save(); }}>{saving ? "Menyimpan…" : "Simpan aturan"}</button>
  {/snippet}
</Modal>
