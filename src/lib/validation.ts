import { z } from "zod";
import { STATUS_ORDER } from "@/lib/status";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), schema.nullable());

export const uuid = z.uuid();

export const venueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  address: optionalText(300),
  notes: optionalText(2000),
  drive_folder_url: z
    .union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)])
    .optional()
    .transform((v) => v || null),
});

export const sceneSchema = z.object({
  venue_id: uuid,
  name: z.string().trim().min(1, "Name is required").max(120),
  description: optionalText(4000),
  surface_height_in: optionalNumber(z.number().min(0).max(120)),
  clearance_notes: optionalText(2000),
  reset_instructions: optionalText(4000),
});

export const photoKinds = ["reference", "layout", "reset", "other"] as const;

export const photoUpdateSchema = z.object({
  id: uuid,
  kind: z.enum(photoKinds),
  caption: optionalText(300),
  scene_id: uuid.optional(),
});

export const taskStatusSchema = z.enum(STATUS_ORDER as [string, ...string[]]);

export const taskPropSchema = z.object({
  name: z.string().trim().min(1).max(120),
  qty: z.coerce.number().int().min(1).max(99).default(1),
  source: z.enum(["at_scene", "to_buy"]),
  acquired: z.boolean().default(false),
});

export const taskSchema = z.object({
  scene_id: uuid,
  instruction: z.string().trim().min(5, "Instruction is too short").max(1000),
  change_reason: optionalText(500),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  arms_required: z.coerce.number().int().min(1).max(2).default(1),
  max_prop_weight_g: optionalNumber(z.number().int().positive().max(20000)),
  difficulty: optionalNumber(z.number().int().min(1).max(5)),
  target_episodes: z.coerce.number().int().min(1).max(10000).default(50),
  feasibility_notes: optionalText(4000),
  notes: optionalText(4000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
  props: z.array(taskPropSchema).max(50).default([]),
  /** Only used on create: "ready" publishes the task to the operator tool immediately. */
  status: z.enum(["proposed", "ready"]).default("proposed"),
});
export type TaskInput = z.input<typeof taskSchema>;

export const taskFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  venue: uuid.optional().catch(undefined),
  scene: uuid.optional().catch(undefined),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((s) => (STATUS_ORDER as string[]).includes(s)) : []))
    .catch([]),
  arms: z.enum(["1", "2"]).optional().catch(undefined),
  tag: z.string().trim().max(40).optional().catch(undefined),
  sort: z
    .enum(["code", "-code", "status", "progress", "-progress", "updated", "priority"])
    .optional()
    .catch(undefined),
  archived: z.enum(["1"]).optional().catch(undefined),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;
