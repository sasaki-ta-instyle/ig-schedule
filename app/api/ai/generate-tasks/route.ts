import { NextResponse } from "next/server";
import { DEFAULT_MODEL, getAnthropicClient } from "@/lib/anthropic";
import { db, schema } from "@/db/client";
import { and, gte, inArray, lte } from "drizzle-orm";
import { WORK_RULES } from "@/lib/work-rules";
import { weeklyCapacityHours } from "@/lib/capacity";
import { weekHolidayList } from "@/lib/ai-helpers";
import {
  addWeeks,
  currentWeekIso,
  toWeekIso,
  weekIsoLabel,
  weekIsoRange,
} from "@/lib/week";

type GenInput = {
  name: string;
  summary: string;
  dueDate?: string | null;
  plannedMemberIds: number[];
  model?: string;
};

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: GenInput;
  try {
    body = (await req.json()) as GenInput;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { name, summary, dueDate, plannedMemberIds, model } = body;
  if (!name || !summary || !Array.isArray(plannedMemberIds) || plannedMemberIds.length === 0) {
    return NextResponse.json(
      { error: "name, summary, plannedMemberIds(>=1) are required" },
      { status: 400 },
    );
  }

  const startWeek = currentWeekIso();
  let endWeek = dueDate ? toWeekIso(new Date(dueDate)) : addWeeks(startWeek, 7);
  if (endWeek < startWeek) endWeek = startWeek;
  const weeks = enumerateWeeksInclusive(startWeek, endWeek);

  const members = await db
    .select()
    .from(schema.members)
    .where(inArray(schema.members.id, plannedMemberIds));

  if (members.length === 0) {
    return NextResponse.json(
      { error: "no matching members" },
      { status: 400 },
    );
  }

  const existingWorkload = await db
    .select()
    .from(schema.workload)
    .where(
      and(
        inArray(schema.workload.memberId, plannedMemberIds),
        gte(schema.workload.weekIso, startWeek),
        lte(schema.workload.weekIso, endWeek),
      ),
    );

  const weekInfo = weeks.map((w) => ({
    weekIso: w,
    label: weekIsoLabel(w),
    capacityHours: weeklyCapacityHours(w),
    holidays: weekHolidayList(w),
  }));

  const loadByMemberWeek: Record<string, number> = {};
  for (const w of existingWorkload) {
    loadByMemberWeek[`${w.memberId}::${w.weekIso}`] = Number(w.plannedHours);
  }

  const memberContext = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    weeklyLoad: weeks.map((w) => ({
      weekIso: w,
      currentPlannedHours: loadByMemberWeek[`${m.id}::${w}`] ?? 0,
    })),
  }));

  const client = getAnthropicClient();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    name,
    summary,
    dueDate: dueDate ?? null,
    startWeek,
    endWeek,
    weekInfo,
    memberContext,
  });

  const response = await client.messages.create({
    model: model ?? DEFAULT_MODEL,
    max_tokens: 4096,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    tools: [
      {
        name: "submit_tasks",
        description:
          "プロジェクト遂行に必要なタスクを列挙し、週と担当者を割り当てて提出する。",
        input_schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              minItems: 3,
              maxItems: 30,
              items: {
                type: "object",
                required: ["title", "weekIso", "assigneeMemberId"],
                properties: {
                  title: { type: "string" },
                  weekIso: { type: "string", pattern: "^\\d{4}-W\\d{2}$" },
                  assigneeMemberId: { type: "integer" },
                  notes: { type: "string" },
                  estimatedHours: { type: "number", minimum: 0 },
                },
              },
            },
            rationale: { type: "string" },
          },
          required: ["tasks"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_tasks" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      { error: "model did not return tool_use", raw: response },
      { status: 502 },
    );
  }
  const raw = toolUse.input as {
    tasks?: Array<{
      title: string;
      weekIso: string;
      assigneeMemberId: number;
      notes?: string;
      estimatedHours?: number;
    }>;
    rationale?: string;
  };

  const memberIdSet = new Set(plannedMemberIds);
  const weekSet = new Set(weeks);
  const tasks = (raw.tasks ?? [])
    .filter(
      (t) =>
        t.title &&
        weekSet.has(t.weekIso) &&
        memberIdSet.has(Number(t.assigneeMemberId)),
    )
    .map((t, i) => ({
      title: t.title,
      weekIso: t.weekIso,
      assigneeMemberId: Number(t.assigneeMemberId),
      notes: t.notes ?? null,
      estimatedHours:
        typeof t.estimatedHours === "number" ? t.estimatedHours : null,
      sortOrder: i,
    }));

  return NextResponse.json({
    tasks,
    rationale: raw.rationale ?? "",
    meta: { startWeek, endWeek, model: model ?? DEFAULT_MODEL },
  });
}

function enumerateWeeksInclusive(start: string, end: string): string[] {
  if (start > end) return [start];
  const out: string[] = [];
  let cur = start;
  let safety = 0;
  while (cur <= end && safety < 260) {
    out.push(cur);
    cur = addWeeks(cur, 1);
    safety++;
  }
  return out;
}

function buildSystemPrompt(): string {
  return [
    "あなたはチームのプロジェクトマネージャーAIです。",
    "ユーザーから渡されるプロジェクト情報をもとに、必要なタスクを洗い出し、週(weekIso = YYYY-Www)と担当者(assigneeMemberId)を割り当てます。",
    "",
    "## 稼働ルール（厳守）",
    `- 稼働曜日: 月〜金のみ`,
    `- 1日実働: ${WORK_RULES.dailyWorkHours}h（昼休憩1h控除済み、就業 ${WORK_RULES.shiftStart}–${WORK_RULES.shiftEnd}）`,
    `- MTG等の固定控除: 週 ${WORK_RULES.weeklyMtgHours}h`,
    "- 通常週のタスク投入可能時間: 32.5h / 週",
    "- 祝日が1日入る週は 25h、2日入る週は 17.5h（実データを user 側で渡す）",
    `- 残業上限: 月 ${WORK_RULES.monthlyOvertimeLimitHours}h まで`,
    "- 提示された 各担当者の currentPlannedHours は既に他案件で確保済みの工数。これを足し合わせて週容量を超えないこと",
    "- estimatedHours の合計が、週ごとの容量を超えないように分散すること",
    "",
    "## タスクの粒度",
    "- 1タスク 0.5〜8h を目安に。大きすぎる粒度は分割し、小さすぎる雑務は束ねる",
    "- タスク名は具体的に。「対応する」「考える」のような曖昧な動詞は避け、成果物が分かる形に",
    "- 不要に重複させない",
    "",
    "## 担当者の割当",
    "- assigneeMemberId は提示された members.id の中からのみ選ぶ",
    "- 同一人物に過度に偏らないこと。ただし役割やスキルが明示されている場合はそれに従う",
    "",
    "出力は必ず submit_tasks ツール経由で返してください。",
  ].join("\n");
}

function buildUserPrompt(args: {
  name: string;
  summary: string;
  dueDate: string | null;
  startWeek: string;
  endWeek: string;
  weekInfo: { weekIso: string; label: string; capacityHours: number; holidays: { date: string; name: string }[] }[];
  memberContext: { id: number; name: string; role: string | null; weeklyLoad: { weekIso: string; currentPlannedHours: number }[] }[];
}): string {
  const lines: string[] = [];
  lines.push(`# プロジェクト: ${args.name}`);
  lines.push("");
  lines.push("## 概要");
  lines.push(args.summary);
  lines.push("");
  lines.push("## 期間");
  lines.push(`- 開始週: ${args.startWeek}`);
  lines.push(`- 期日: ${args.dueDate ?? "(未指定 → 8 週後を想定)"}`);
  lines.push(`- 期日週: ${args.endWeek}`);
  lines.push("");
  lines.push("## 週情報（容量と祝日）");
  for (const w of args.weekInfo) {
    const hol = w.holidays.length
      ? ` 祝日: ${w.holidays.map((h) => `${h.date}(${h.name})`).join(", ")}`
      : "";
    lines.push(`- ${w.weekIso} (${w.label}) 容量 ${w.capacityHours}h${hol}`);
  }
  lines.push("");
  lines.push("## 担当メンバーと既存負荷");
  for (const m of args.memberContext) {
    lines.push(`### id=${m.id} ${m.name}${m.role ? ` (${m.role})` : ""}`);
    for (const l of m.weeklyLoad) {
      lines.push(`  - ${l.weekIso}: 既存 ${l.currentPlannedHours}h`);
    }
  }
  lines.push("");
  lines.push("submit_tasks ツールで結果を返してください。");
  return lines.join("\n");
}
