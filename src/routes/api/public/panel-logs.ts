import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    employee_number: z.string().optional(),
    // ISO date, e.g. "2026-07-18". If omitted, returns all retained logs (last 3 days).
    date: z.string().optional(),
});

type Row = {
    id: string;
    kind: "check_in" | "check_out";
    logged_at: string;
    employee_number: string | null;
    employee_name: string | null;
    department: string | null;
};

type Summary = {
    employee_number: string | null;
    employee_name: string | null;
    department: string | null;
    date: string; // YYYY-MM-DD (UTC)
    first_check_in: string | null;
    last_check_out: string | null;
    status:
        | "complete"
        | "checked_in_only"
        | "checked_out_only"
        | "no_activity";
};

export const Route = createFileRoute("/api/public/panel-logs")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const { admin, requirePanelKey, jsonResponse } = await import(
                    "@/lib/gateway.server"
                );
                const unauth = requirePanelKey(request);
                if (unauth) return unauth;

                let parsed;
                try {
                    parsed = bodySchema.parse(
                        await request.json().catch(() => ({})),
                    );
                } catch (e) {
                    return jsonResponse(
                        { error: "invalid body", detail: String(e) },
                        400,
                    );
                }

                let query = admin
                    .from("attendance_logs")
                    .select(
                        "id, kind, logged_at, employees(employee_number, name), departments(name)",
                    )
                    .order("logged_at", { ascending: false });

                if (parsed.date) {
                    const start = new Date(
                        parsed.date + "T00:00:00Z",
                    ).toISOString();
                    const end = new Date(
                        new Date(parsed.date + "T00:00:00Z").getTime() +
                            24 * 60 * 60 * 1000,
                    ).toISOString();
                    query = query.gte("logged_at", start).lt("logged_at", end);
                }

                const { data, error } = await query;
                if (error) return jsonResponse({ error: error.message }, 500);

                let rows: Row[] = (data ?? []).map((r) => {
                    const emp = Array.isArray(r.employees)
                        ? r.employees[0]
                        : r.employees;
                    const dep = Array.isArray(r.departments)
                        ? r.departments[0]
                        : r.departments;
                    return {
                        id: r.id,
                        kind: r.kind as "check_in" | "check_out",
                        logged_at: r.logged_at,
                        employee_number: emp?.employee_number ?? null,
                        employee_name: emp?.name ?? null,
                        department: dep?.name ?? null,
                    };
                });

                if (parsed.employee_number) {
                    rows = rows.filter(
                        (r) => r.employee_number === parsed.employee_number,
                    );
                }

                // Build per-employee-per-day summary so the panel can see
                // "only checked in" / "only checked out" / "complete" cases.
                const buckets = new Map<string, Row[]>();
                for (const r of rows) {
                    const day = r.logged_at.slice(0, 10);
                    const key = `${r.employee_number}|${day}`;
                    const arr = buckets.get(key) ?? [];
                    arr.push(r);
                    buckets.set(key, arr);
                }

                const summary: Summary[] = [];
                for (const [key, items] of buckets) {
                    const [, day] = key.split("|");
                    const sorted = [...items].sort((a, b) =>
                        a.logged_at.localeCompare(b.logged_at),
                    );
                    const firstIn = sorted.find((r) => r.kind === "check_in");
                    const lastOut = [...sorted]
                        .reverse()
                        .find((r) => r.kind === "check_out");

                    let status: Summary["status"];
                    if (firstIn && lastOut) status = "complete";
                    else if (firstIn) status = "checked_in_only";
                    else if (lastOut) status = "checked_out_only";
                    else status = "no_activity";

                    const sample = sorted[0];
                    summary.push({
                        employee_number: sample.employee_number,
                        employee_name: sample.employee_name,
                        department: sample.department,
                        date: day,
                        first_check_in: firstIn?.logged_at ?? null,
                        last_check_out: lastOut?.logged_at ?? null,
                        status,
                    });
                }

                summary.sort((a, b) =>
                    (b.date + (b.employee_number ?? "")).localeCompare(
                        a.date + (a.employee_number ?? ""),
                    ),
                );

                return jsonResponse({
                    ok: true,
                    count: rows.length,
                    logs: rows,
                    summary,
                });
            },
        },
    },
});
