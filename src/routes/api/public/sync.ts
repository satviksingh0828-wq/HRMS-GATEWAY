import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    employees: z.array(
        z.object({
            name: z.string().min(1),
            number: z.string().min(1),
            department: z.string().min(1),
            department_latitude: z.number().nullable().optional(),
            department_longitude: z.number().nullable().optional(),
        }),
    ),
});

export const Route = createFileRoute("/api/public/sync")({
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
                    parsed = bodySchema.parse(await request.json());
                } catch (e) {
                    return jsonResponse(
                        { error: "invalid body", detail: String(e) },
                        400,
                    );
                }

                // ---- 1. Departments from payload ----
                const deptMap = new Map<
                    string,
                    { name: string; latitude: number | null; longitude: number | null }
                >();
                for (const e of parsed.employees) {
                    if (!deptMap.has(e.department)) {
                        deptMap.set(e.department, {
                            name: e.department,
                            latitude: e.department_latitude ?? null,
                            longitude: e.department_longitude ?? null,
                        });
                    }
                }

                const payloadDeptNames = new Set(deptMap.keys());
                const payloadEmpNumbers = new Set(
                    parsed.employees.map((e) => e.number),
                );

                // ---- 2. Load existing departments ----
                const { data: existingDepts, error: exDErr } = await admin
                    .from("departments")
                    .select("id, name, is_active");
                if (exDErr) return jsonResponse({ error: exDErr.message }, 500);

                const existingByName = new Map(
                    (existingDepts ?? []).map((d) => [d.name, d]),
                );

                let deptsCreated = 0;
                let deptsUpdated = 0;
                let deptsReactivated = 0;

                // Upsert each payload department.
                for (const d of deptMap.values()) {
                    const existing = existingByName.get(d.name);
                    if (existing) {
                        const patch: Record<string, unknown> = {
                            latitude: d.latitude,
                            longitude: d.longitude,
                        };
                        if (existing.is_active === false) {
                            patch.is_active = true;
                            deptsReactivated++;
                        }
                        await admin
                            .from("departments")
                            .update(patch)
                            .eq("id", existing.id);
                        deptsUpdated++;
                    } else {
                        await admin.from("departments").insert({
                            name: d.name,
                            latitude: d.latitude,
                            longitude: d.longitude,
                        });
                        deptsCreated++;
                    }
                }

                // Deactivate departments no longer in the payload
                // (soft delete — preserves attendance history).
                const deptsToDeactivate = (existingDepts ?? []).filter(
                    (d) => !payloadDeptNames.has(d.name) && d.is_active !== false,
                );
                if (deptsToDeactivate.length) {
                    await admin
                        .from("departments")
                        .update({ is_active: false })
                        .in(
                            "id",
                            deptsToDeactivate.map((d) => d.id),
                        );
                }

                // ---- 3. Reload dept name -> id (post-insert) ----
                const { data: allDepts, error: depErr } = await admin
                    .from("departments")
                    .select("id, name");
                if (depErr) return jsonResponse({ error: depErr.message }, 500);
                const nameToId = new Map(
                    (allDepts ?? []).map((d) => [d.name, d.id as string]),
                );

                // ---- 4. Employees ----
                const { data: existingEmps, error: exEErr } = await admin
                    .from("employees")
                    .select("id, employee_number, name, department_id, is_active");
                if (exEErr) return jsonResponse({ error: exEErr.message }, 500);

                const existingByNumber = new Map(
                    (existingEmps ?? []).map((e) => [e.employee_number, e]),
                );

                let empsCreated = 0;
                let empsUpdated = 0;
                let empsReactivated = 0;

                const nowIso = new Date().toISOString();
                for (const e of parsed.employees) {
                    const deptId = nameToId.get(e.department)!;
                    const existing = existingByNumber.get(e.number);
                    if (existing) {
                        const patch: Record<string, unknown> = {
                            name: e.name,
                            department_id: deptId,
                            updated_at: nowIso,
                        };
                        if (existing.is_active === false) {
                            patch.is_active = true;
                            empsReactivated++;
                        }
                        await admin
                            .from("employees")
                            .update(patch)
                            .eq("id", existing.id);
                        empsUpdated++;
                    } else {
                        await admin.from("employees").insert({
                            employee_number: e.number,
                            name: e.name,
                            department_id: deptId,
                        });
                        empsCreated++;
                    }
                }

                // Deactivate employees removed from the roster.
                const empsToDeactivate = (existingEmps ?? []).filter(
                    (e) =>
                        !payloadEmpNumbers.has(e.employee_number) &&
                        e.is_active !== false,
                );
                if (empsToDeactivate.length) {
                    await admin
                        .from("employees")
                        .update({ is_active: false, updated_at: nowIso })
                        .in(
                            "id",
                            empsToDeactivate.map((e) => e.id),
                        );
                }

                // ---- 5. Return department creds + counts ----
                const { data: departments } = await admin
                    .from("departments")
                    .select(
                        "id, name, latitude, longitude, device_id, device_password, is_active",
                    );

                return jsonResponse({
                    ok: true,
                    counts: {
                        employees_created: empsCreated,
                        employees_updated: empsUpdated,
                        employees_reactivated: empsReactivated,
                        employees_deactivated: empsToDeactivate.length,
                        departments_created: deptsCreated,
                        departments_updated: deptsUpdated,
                        departments_reactivated: deptsReactivated,
                        departments_deactivated: deptsToDeactivate.length,
                    },
                    departments,
                });
            },
        },
    },
});
