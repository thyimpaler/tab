// Vercel Node function: every /api/* request goes to the Hono app (web-standard Request/Response).
import { app } from "../src/server/app.js";

const handler = (req: Request) => app.fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
