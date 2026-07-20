import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
    device_id: z.string().uuid(),
    device_password: z.string().min(1),
});

export const Route = createFileRoute("/api/public/dept-code")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const { admin, jsonResponse, getOrRotateDepartmentCode } =
                    await import("@/lib/gateway.server");

                let parsed;
                try {
                    parsed = bodySchema.parse(await request.json());
                } catch (e) {
                    return jsonResponse(
                        { error: "invalid body", detail: String(e) },
                        400,
                    );
                }

                const { data: dept } = await admin
                    .from("departments")
                    .select("id, name")
                    .eq("device_id", parsed.device_id)
                    .eq("device_password", parsed.device_password)
                    .maybeSingle();

                if (!dept) {
                    return jsonResponse(
                        { error: "invalid device credentials" },
                        401,
                    );
                }

                const { code, rotated_at } = await getOrRotateDepartmentCode(
                    dept.id,
                );
                return jsonResponse({
                    department: dept.name,
                    code,
                    rotated_at,
                    expires_in_seconds: Math.max(
                        0,
                        600 -
                            Math.floor(
                                (Date.now() - new Date(rotated_at).getTime()) /
                                    1000,
                            ),
                    ),
                });
            },
        },
    },
});