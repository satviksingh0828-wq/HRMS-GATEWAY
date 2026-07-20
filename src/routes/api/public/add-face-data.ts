import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    employee_number: z.string().min(1),
    face_data: z.string().min(1),
});

export const Route = createFileRoute("/api/public/add-face-data")({
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

                const { data: emp, error: fetchError } = await admin
                    .from("employees")
                    .select("face_data")
                    .eq("employee_number", parsed.employee_number)
                    .maybeSingle();

                if (fetchError) {
                    return jsonResponse({ error: fetchError.message }, 500);
                }

                if (!emp) {
                    return jsonResponse({ error: "employee not found" }, 404);
                }

                if (emp.face_data) {
                    return jsonResponse({ error: "face_data already exists and cannot be changed" }, 400);
                }

                const { error: updateError } = await admin
                    .from("employees")
                    .update({ face_data: parsed.face_data })
                    .eq("employee_number", parsed.employee_number);

                if (updateError) {
                    return jsonResponse({ error: updateError.message }, 500);
                }

                return jsonResponse({
                    ok: true,
                    message: "face_data added successfully",
                });
            },
        },
    },
});
