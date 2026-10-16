import type * as schema from "@/db/schema";
export type Deal = typeof schema.deals.$inferSelect;
export type Creator = typeof schema.creators.$inferSelect;
export type Brand = typeof schema.brands.$inferSelect;
