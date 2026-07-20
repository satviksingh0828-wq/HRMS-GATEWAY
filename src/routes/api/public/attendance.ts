import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    employee_number: z.string().min(1),
    employee_name: z.string().min(1),
    department_code: z.string().length(10),
    kind: z.enum(["check_in", "check_out"]),
    // Optional client-supplied timestamp; server records now() if absent.
    time: z.string().datetime().optional(),
});

function startOfUtcDay(d: Date): Date {
    return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
}

export const Route = createFileRoute("/api/public/attendance")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const { admin, jsonResponse } = await import(
                    "@/lib/gateway.server"
                );

                let parsed;
                try {
                    parsed = bodySchema.parse(await request.json());
                } catch (e) {
                    return jsonResponse(
                        { error: "invalid body", detail: String(e) },
                        400,
                    );
                }

                // Look up employee + department.
                const { data: emp } = await admin
                    .from("employees")
                    .select(
                        "id, name, department_id, is_active, face_data, departments(id, name, is_active)",
                    )
                    .eq("employee_number", parsed.employee_number)
                    .maybeSingle();

                if (!emp) {
                    return jsonResponse({ error: "employee not found" }, 404);
                }
                if (emp.is_active === false) {
                    return jsonResponse(
                        { error: "employee is inactive, contact panel admin" },
                        403,
                    );
                }
                if (
                    emp.name.trim().toLowerCase() !==
                    parsed.employee_name.trim().toLowerCase()
                ) {
                    return jsonResponse(
                        { error: "employee name mismatch, try again" },
                        400,
                    );
                }

                const deptField = emp.departments as
                    | { id: string; name: string; is_active?: boolean }
                    | { id: string; name: string; is_active?: boolean }[]
                    | null;
                const deptRow = Array.isArray(deptField)
                    ? (deptField[0] ?? null)
                    : deptField;

                if (deptRow?.is_active === false) {
                    return jsonResponse(
                        { error: "department is inactive, contact panel admin" },
                        403,
                    );
                }

                // Verify department code matches AND is still fresh (<= 10 min).
                const { data: codeRow } = await admin
                    .from("department_codes")
                    .select("code, rotated_at")
                    .eq("department_id", emp.department_id)
                    .maybeSingle();

                const fresh =
                    codeRow &&
                    Date.now() - new Date(codeRow.rotated_at).getTime() <
                        10 * 60 * 1000;

                if (!fresh || codeRow?.code !== parsed.department_code) {
                    return jsonResponse(
                        {
                            error: "invalid or expired department code, try again",
                        },
                        401,
                    );
                }

                // ---- Enforce daily check_in / check_out sequence ----
                const eventTime = parsed.time
                    ? new Date(parsed.time)
                    : new Date();
                const dayStart = startOfUtcDay(eventTime).toISOString();
                const dayEnd = new Date(
                    startOfUtcDay(eventTime).getTime() + 24 * 60 * 60 * 1000,
                ).toISOString();

                const { data: todayLogs } = await admin
                    .from("attendance_logs")
                    .select("kind, logged_at")
                    .eq("employee_id", emp.id)
                    .gte("logged_at", dayStart)
                    .lt("logged_at", dayEnd)
                    .order("logged_at", { ascending: false });

                const last = todayLogs?.[0];
                const hasCheckInToday = (todayLogs ?? []).some(
                    (l) => l.kind === "check_in",
                );

                if (parsed.kind === "check_in") {
                    if (last?.kind === "check_in") {
                        return jsonResponse(
                            {
                                error: "already checked in today, please check out first",
                                last_event: last,
                            },
                            409,
                        );
                    }
                    // A second check_in after a check_out is allowed (re-entry).
                } else {
                    // check_out
                    if (!hasCheckInToday) {
                        return jsonResponse(
                            {
                                error: "no check-in found for today, please check in first",
                            },
                            409,
                        );
                    }
                    if (last?.kind === "check_out") {
                        return jsonResponse(
                            {
                                error: "already checked out, please check in again if returning",
                                last_event: last,
                            },
                            409,
                        );
                    }
                }

                const logged_at = eventTime.toISOString();
                const { error: insErr } = await admin
                    .from("attendance_logs")
                    .insert({
                        employee_id: emp.id,
                        department_id: emp.department_id,
                        kind: parsed.kind,
                        logged_at,
                    });
                if (insErr) {
                    return jsonResponse({ error: insErr.message }, 500);
                }

                const response: any = {
                    ok: true,
                    employee_number: parsed.employee_number,
                    employee_name: emp.name,
                    department: deptRow?.name ?? null,
                    kind: parsed.kind,
                    logged_at,
                };

                // Check if face data exists. If not, ask to add it.
                if (!emp.face_data) {
                    response.action_required = "add_face_data";
                    response.message = "Attendance logged. Please add face data.";
                }

                return jsonResponse(response);
            },
        },
    },
});
