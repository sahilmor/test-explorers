import { z } from "zod";
import { ROLES } from "@/models/User";

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
  classId: z.string().trim().length(24).optional(),
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
