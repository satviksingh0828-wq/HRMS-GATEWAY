import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    employee_number: z.string().min(1),
});

export const Route = createFileRoute("/api/public/employee")({
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

                const { data: emp } = await admin
                    .from("employees")
                    .select("employee_number, name, face_data, departments(name)")
                    .eq("employee_number", parsed.employee_number)
                    .maybeSingle();

                if (!emp) {
                    return jsonResponse({ error: "employee not found" }, 404);
                }

                const deptField = emp.departments as
                    | { name: string }
                    | { name: string }[]
                    | null;
                const dept = Array.isArray(deptField)
                    ? (deptField[0] ?? null)
                    : deptField;
                return jsonResponse({
                    employee_number: emp.employee_number,
                    name: emp.name,
                    department: dept?.name ?? null,
                    face_data: emp.face_data ?? null,
                });
            },
        },
    },
});
