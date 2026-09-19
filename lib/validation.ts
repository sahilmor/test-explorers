import { z } from "zod";
import { ROLES } from "@/models/User";
import { MAX_GRADE, MIN_GRADE } from "@/models/Section";
import { DIFFICULTIES, OPTION_COUNT } from "@/models/Question";

/** A 24-character hex Mongo ObjectId, as it appears in a URL or JSON body. */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "That doesn't look like a valid id.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "That email looks too short.")
  .max(254)
  .email("That doesn't look like an email address.");

export const passwordSchema = z
  .string()
  .min(8, "Passwords need at least 8 characters.")
  .max(200, "That password is longer than we can hash. Try a shorter one.");

export const signupSchema = z.object({
  schoolName: z
    .string()
    .trim()
    .min(2, "Your school needs a name with at least 2 characters.")
    .max(120),
  name: z.string().trim().min(2, "We need your name.").max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

/**
 * Note what is NOT here: schoolId. A client cannot ask for a user to be
 * created in a particular school — the school always comes from the caller's
 * verified token. Unknown keys are stripped by Zod rather than passed to
 * Mongoose.
 */
export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES),
  sectionId: objectIdSchema.optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Turns a ZodError into `{ field: message }` for the forms to render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 2 — school setup
// ---------------------------------------------------------------------------

/*
 * As with Phase 1: none of these schemas has a schoolId field. The school
 * always comes from the verified session, and Zod strips a smuggled one rather
 * than passing it through to Mongoose.
 */

export const sectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the section a name, like \"Grade 9 - A\".")
    .max(80, "That name is too long — 80 characters maximum."),
  grade: z.coerce
    .number()
    .int("Grade has to be a whole number.")
    .min(MIN_GRADE, `Grade has to be between ${MIN_GRADE} and ${MAX_GRADE}.`)
    .max(MAX_GRADE, `Grade has to be between ${MIN_GRADE} and ${MAX_GRADE}.`),
});

export const subjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the subject a name, like \"Physics\".")
    .max(80, "That name is too long — 80 characters maximum."),
});

export const createTeacherSchema = z.object({
  name: z.string().trim().min(2, "We need the teacher's name.").max(120),
  email: emailSchema,
  // Optional: leave it blank and the server generates one to show once.
  password: z.union([passwordSchema, z.literal("")]).optional(),
  subjectIds: z.array(objectIdSchema).max(50).optional(),
  sectionIds: z.array(objectIdSchema).max(50).optional(),
});

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, "We need the student's name.").max(120),
  email: emailSchema,
  sectionId: objectIdSchema,
  password: z.union([passwordSchema, z.literal("")]).optional(),
});

export type SectionInput = z.infer<typeof sectionSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

// ---------------------------------------------------------------------------
// Phase 3 — question bank
// ---------------------------------------------------------------------------

const optionSchema = z
  .string()
  .trim()
  .min(1, "Every option needs some text.")
  .max(500, "That option is too long — 500 characters maximum.");

/*
 * Note again what is absent: schoolId and createdBy. Both come from the
 * verified session, and Zod strips a smuggled one rather than passing it on.
 */
export const questionSchema = z.object({
  subjectId: objectIdSchema,
  text: z
    .string()
    .trim()
    .min(1, "The question needs some text.")
    .max(2000, "That question is too long — 2000 characters maximum."),
  // Exactly four, no more and no fewer. A three-option question would break
  // every screen that renders A–D.
  options: z
    .array(optionSchema)
    .length(OPTION_COUNT, `A question needs exactly ${OPTION_COUNT} options.`),
  correctOptionIndex: z.coerce
    .number()
    .int("Pick which option is correct.")
    .min(0, "Pick which option is correct.")
    .max(
      OPTION_COUNT - 1,
      `The correct option has to be one of the ${OPTION_COUNT}.`
    ),
  difficulty: z.enum(DIFFICULTIES, {
    message: "Pick easy, medium or hard.",
  }),
  imageUrl: z
    .union([z.string().trim().url("That image link doesn't look like a URL."), z.literal("")])
    .optional()
    .nullable(),
});

export type QuestionInput = z.infer<typeof questionSchema>;
