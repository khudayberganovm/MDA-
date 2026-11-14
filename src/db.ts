import { PrismaClient } from "@prisma/client";
export const db = new PrismaClient();
export const STATUSES = ["draft", "queued", "planning", "sourcing", "voicing", "rendering", "completed", "failed"] as const;
export type ProjectStatus = (typeof STATUSES)[number];
