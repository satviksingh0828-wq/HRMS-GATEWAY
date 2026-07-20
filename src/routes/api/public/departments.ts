import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/departments")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const { admin, requirePanelKey, jsonResponse } = await import(
                    "@/lib/gateway.server"
                );
                const unauth = requirePanelKey(request);
                if (unauth) return unauth;

                const { data, error } = await admin
                    .from("departments")
                    .select("name, device_id, device_password")
                    .order("name");

                if (error) return jsonResponse({ error: error.message }, 500);

                return jsonResponse({ ok: true, departments: data });
            },
        },
    },
});
