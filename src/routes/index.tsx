import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: "ATTENDENCE GATEWAY" },
            {
                name: "description",
                content:
                    "Smart Gateway Hub manages employee data, department codes, and attendance logs.",
            },
        ],
    }),
    component: Index,
});

type Response = { status: number; label: string; body: string };
type Endpoint = {
    path: string;
    auth: string;
    note: string;
    request: string;
    responses: Response[];
};

const endpoints: Endpoint[] = [
    {
        path: "GET /api/public/departments",
        auth: "header  x-panel-key: <PANEL_KEY>",
        note: "Returns all departments with their device credentials (device_id and device_password). Useful for the panel app to display or verify per-department device pairing.",
        request: `(no body)`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "ok": true,
  "departments": [
    {
      "name": "Ops",
      "device_id": "8c2f...-uuid",
      "device_password": "a1b2c3d4e5f60718"
    }
  ]
}`,
            },
            {
                status: 401,
                label: "Missing/invalid panel key",
                body: `{ "error": "invalid panel key" }`,
            },
            {
                status: 500,
                label: "DB error",
                body: `{ "error": "<postgres message>" }`,
            },
        ],
    },
    {
        path: "POST /api/public/sync",
        auth: "header  x-panel-key: <PANEL_KEY>",
        note: "Panel app pushes the full employee list. Creates/updates departments (fixed device_id + device_password are generated on first insert and returned in the response) and upserts employees by employee_number.",
        request: `{
  "employees": [
    {
      "name": "Ada Lovelace",
      "number": "E001",
      "department": "Ops",
      "department_latitude": 40.7128,
      "department_longitude": -74.0060
    }
  ]
}`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "ok": true,
  "employees_synced": 1,
  "departments": [
    {
      "id": "b1e6...-uuid",
      "name": "Ops",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "device_id": "8c2f...-uuid",
      "device_password": "a1b2c3d4e5f60718"
    }
  ]
}`,
            },
            {
                status: 401,
                label: "Missing/invalid panel key",
                body: `{ "error": "invalid panel key" }`,
            },
            {
                status: 400,
                label: "Invalid body",
                body: `{ "error": "invalid body", "detail": "ZodError: ..." }`,
            },
            {
                status: 500,
                label: "DB error",
                body: `{ "error": "<postgres message>" }`,
            },
        ],
    },
    {
        path: "POST /api/public/dept-code",
        auth: "device_id + device_password in body (per-department)",
        note: "Returns the current 10-digit code for the department, auto-rotated every 10 minutes.",
        request: `{
  "device_id": "8c2f...-uuid",
  "device_password": "a1b2c3d4e5f60718"
}`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "department": "Ops",
  "code": "0123456789",
  "rotated_at": "2026-07-18T09:00:00.000Z",
  "expires_in_seconds": 600
}`,
            },
            {
                status: 401,
                label: "Invalid device credentials",
                body: `{ "error": "invalid device credentials" }`,
            },
            {
                status: 400,
                label: "Invalid body",
                body: `{ "error": "invalid body", "detail": "..." }`,
            },
        ],
    },
    {
        path: "POST /api/public/employee",
        auth: "none",
        note: "Returns the employee's name, department, and face data for a given employee_number.",
        request: `{ "employee_number": "E001" }`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "employee_number": "E001",
  "name": "Ada Lovelace",
  "department": "Ops",
  "face_data": "base64-encoded-face-data-or-null"
}`,
            },
            {
                status: 404,
                label: "Not found",
                body: `{ "error": "employee not found" }`,
            },
            {
                status: 400,
                label: "Invalid body",
                body: `{ "error": "invalid body", "detail": "..." }`,
            },
        ],
    },
    {
        path: "POST /api/public/add-face-data",
        auth: "none",
        note: "Allows adding face data for an employee. Face data is immutable once stored.",
        request: `{ 
  "employee_number": "E001",
  "face_data": "base64-encoded-face-data"
}`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "ok": true,
  "message": "face_data added successfully"
}`,
            },
            {
                status: 400,
                label: "Face data already exists",
                body: `{ "error": "face_data already exists and cannot be changed" }`,
            },
            {
                status: 404,
                label: "Employee not found",
                body: `{ "error": "employee not found" }`,
            },
            {
                status: 400,
                label: "Invalid body",
                body: `{ "error": "invalid body", "detail": "..." }`,
            },
        ],
    },
    {
        path: "POST /api/public/attendance",
        auth: "department_code (10-digit, from /dept-code)",
        note: "Verifies employee_number + employee_name match a stored employee, AND that department_code is valid and fresh (within 10 minutes). Also checks for facial data; if missing, it still returns a positive response but asks the app to collect face data. Face data is immutable once stored. Logs older than 3 days are auto-pruned.",
        request: `{
  "employee_number": "E001",
  "employee_name": "Ada Lovelace",
  "department_code": "0123456789",
  "kind": "check_in",
  "time": "2026-07-18T09:00:00Z"
}`,
        responses: [
            {
                status: 200,
                label: "Success (Face Data Exists)",
                body: `{
  "ok": true,
  "employee_number": "E001",
  "employee_name": "Ada Lovelace",
  "department": "Ops",
  "kind": "check_in",
  "logged_at": "2026-07-18T09:00:00.000Z"
}`,
            },
            {
                status: 200,
                label: "Success (Missing Face Data)",
                body: `{
  "ok": true,
  "employee_number": "E001",
  "employee_name": "Ada Lovelace",
  "department": "Ops",
  "kind": "check_in",
  "logged_at": "2026-07-18T09:00:00.000Z",
  "action_required": "add_face_data",
  "message": "Attendance logged. Please add face data."
}`,
            },
            {
                status: 404,
                label: "Employee number not found",
                body: `{ "error": "employee not found" }`,
            },
            {
                status: 400,
                label: "Name does not match stored employee",
                body: `{ "error": "employee name mismatch, try again" }`,
            },
            {
                status: 401,
                label: "Code wrong or expired (>10 min) — retry",
                body: `{ "error": "invalid or expired department code, try again" }`,
            },
            {
                status: 400,
                label: "Invalid body (missing field, bad kind, etc.)",
                body: `{ "error": "invalid body", "detail": "..." }`,
            },
            {
                status: 500,
                label: "DB insert failure",
                body: `{ "error": "<postgres message>" }`,
            },
        ],
    },
    {
        path: "POST /api/public/panel-logs",
        auth: "header  x-panel-key: <PANEL_KEY>",
        note: "Panel fetches check-in/check-out logs. Both fields optional: filter by date (UTC day) and/or employee_number. Only the last 3 days are retained.",
        request: `{
  "date": "2026-07-18",
  "employee_number": "E001"
}`,
        responses: [
            {
                status: 200,
                label: "Success",
                body: `{
  "ok": true,
  "count": 2,
  "logs": [
    {
      "id": "log-uuid",
      "kind": "check_in",
      "logged_at": "2026-07-18T09:00:00.000Z",
      "employee_number": "E001",
      "employee_name": "Ada Lovelace",
      "department": "Ops"
    },
    {
      "id": "log-uuid-2",
      "kind": "check_out",
      "logged_at": "2026-07-18T17:03:11.000Z",
      "employee_number": "E001",
      "employee_name": "Ada Lovelace",
      "department": "Ops"
    }
  ]
}`,
            },
            {
                status: 401,
                label: "Missing/invalid panel key",
                body: `{ "error": "invalid panel key" }`,
            },
            {
                status: 500,
                label: "DB error",
                body: `{ "error": "<postgres message>" }`,
            },
        ],
    },
];

function statusColor(status: number) {
    if (status < 300) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    if (status < 500) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
}

function Index() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-4xl px-6 py-12">
                <h1 className="text-3xl font-bold">Attendance Gateway</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Six JSON endpoints under{" "}
                    <code className="rounded bg-muted px-1">/api/public/*</code>.
                    All requests and responses are JSON.
                </p>

                <div className="mt-8 space-y-6">
                    {endpoints.map((e) => (
                        <section
                            key={e.path}
                            className="rounded-lg border border-border bg-card p-5"
                        >
                            <header className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="font-mono text-base font-semibold">
                                    {e.path}
                                </h2>
                                <span className="text-xs text-muted-foreground">
                                    Auth: <code className="rounded bg-muted px-1">{e.auth}</code>
                                </span>
                            </header>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {e.note}
                            </p>

                            <div className="mt-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Request body
                                </div>
                                <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
{e.request}
                                </pre>
                            </div>

                            <div className="mt-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Possible responses
                                </div>
                                <div className="mt-2 space-y-2">
                                    {e.responses.map((r, i) => (
                                        <div
                                            key={i}
                                            className="rounded border border-border bg-background p-3"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold ${statusColor(r.status)}`}
                                                >
                                                    {r.status}
                                                </span>
                                                <span className="text-sm">{r.label}</span>
                                            </div>
                                            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
{r.body}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ))}
                </div>

                <div className="mt-8 rounded-lg border border-border bg-card p-4 text-sm">
                    <strong>Setup:</strong> run{" "}
                    <code className="rounded bg-muted px-1">supabase-schema.sql</code>,{" "}
                    <code className="rounded bg-muted px-1">supabase-schema-addendum.sql</code>,{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1">supabase-schema-facial-verification.sql</code>{" "}
                    in the Supabase SQL editor. Set{" "}
                    <code className="rounded bg-muted px-1">SUPABASE_URL</code>,{" "}
                    <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code>,{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1">PANEL_KEY</code>{" "}
                    as environment variables (see <code className="rounded bg-muted px-1">.env.example</code>).
                </div>
            </div>
        </div>
    );
}
