import { z } from "zod";
import { ROLES } from "@/models/User";
import { MAX_GRADE, MIN_GRADE } from "@/models/Section";
import { DIFFICULTIES, OPTION_COUNT } from "@/models/Question";
import {
  MAX_AUTO_QUESTIONS,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
} from "@/lib/tests-shared";

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

// ---------------------------------------------------------------------------
// Phase 4 — test creation and assignment
// ---------------------------------------------------------------------------

/** Accepts an ISO string or a datetime-local value and gives back a Date. */
const dateTimeSchema = z.coerce.date({
  message: "Pick a date and a time.",
});

/*
 * As always: no schoolId and no createdBy. Both come from the verified session.
 */
export const testSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the test a title, like \"Unit 3 — Forces\".")
      .max(200, "That title is too long — 200 characters maximum."),
    subjectId: objectIdSchema,
    durationMinutes: z.coerce
      .number()
      .int("Duration has to be a whole number of minutes.")
      .min(MIN_DURATION_MINUTES, "A test needs at least a minute.")
      .max(
        MAX_DURATION_MINUTES,
        `${MAX_DURATION_MINUTES} minutes is the longest a single sitting can be.`
      ),
    questionIds: z.array(objectIdSchema).max(500),
    opensAt: dateTimeSchema,
    closesAt: dateTimeSchema,
    sectionIds: z.array(objectIdSchema).max(100).optional(),
    // The teacher's intent. The server turns this into a stored status.
    publish: z.boolean().optional(),
  })
  // A window that closes before it opens would make the test permanently
  // invisible rather than throwing, so it is rejected up front.
  .refine((v) => v.closesAt > v.opensAt, {
    message: "The closing time has to be after the opening time.",
    path: ["closesAt"],
  })
  // Publishing with no questions would put an empty paper in front of a class.
  .refine((v) => !v.publish || v.questionIds.length > 0, {
    message: "Add at least one question before publishing.",
    path: ["questionIds"],
  });

export const assignmentSchema = z.object({
  sectionIds: z.array(objectIdSchema).max(100),
});

export const autoSelectSchema = z.object({
  subjectId: objectIdSchema,
  count: z.coerce
    .number()
    .int("Pick a whole number of questions.")
    .min(1, "Pick at least one question.")
    .max(MAX_AUTO_QUESTIONS, `${MAX_AUTO_QUESTIONS} is the most you can pull at once.`),
  difficulty: z.enum(DIFFICULTIES).optional(),
});

export type TestInput = z.infer<typeof testSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type AutoSelectInput = z.infer<typeof autoSelectSchema>;

// ---------------------------------------------------------------------------
// Phase 5 — sitting a test
// ---------------------------------------------------------------------------

import { OPTION_COUNT as MCQ_OPTION_COUNT } from "@/lib/questions-shared";

/**
 * One saved response.
 *
 * `selectedOptionIndex: null` is meaningful — it means the student opened the
 * question and left it blank, which the palette shows differently from a
 * question never visited at all.
 */
export const responseSchema = z.object({
  questionId: objectIdSchema,
  // `null` FIRST, and no coercion. `z.coerce.number()` turns null into 0,
  // which would silently record "cleared my answer" as "chose option A" —
  // a wrong mark on a real paper, from a schema detail.
  selectedOptionIndex: z
    .union([
      z.null(),
      z
        .number()
        .int("Pick one of the options.")
        .min(0, "Pick one of the options.")
        .max(MCQ_OPTION_COUNT - 1, "Pick one of the options."),
    ])
    .default(null),
  markedForReview: z.boolean().default(false),
});

export const saveResponsesSchema = z.object({
  // A batch, so a flush after a network blip can send everything pending in
  // one request rather than one request per answer.
  responses: z.array(responseSchema).min(1).max(500),
});

export type ResponsePayload = z.infer<typeof responseSchema>;

/**
 * What Razorpay Checkout hands back.
 *
 * `cancelled` covers the customer closing the window or the card being
 * declined, which arrives with no payment id at all — so the three payment
 * fields are optional here and required by the refinement below only when a
 * payment is actually being claimed.
 */
export const checkoutResultSchema = z
  .object({
    razorpay_order_id: z.string().min(1, "Missing the order id."),
    razorpay_payment_id: z.string().min(1).optional(),
    razorpay_signature: z.string().min(1).optional(),
    cancelled: z.boolean().optional().default(false),
    reason: z.string().max(300).optional(),
  })
  .refine(
    (v) => v.cancelled || (!!v.razorpay_payment_id && !!v.razorpay_signature),
    {
      message: "A completed payment needs both a payment id and a signature.",
      path: ["razorpay_payment_id"],
    }
  );

export type CheckoutResultInput = z.infer<typeof checkoutResultSchema>;

// ---------------------------------------------------------------------------
// Platform owner: managing somebody else's school
// ---------------------------------------------------------------------------

export const setPlanSchema = z.object({
  plan: z.enum(["trial", "active", "expired"]),
  planValidUntil: dateTimeSchema,
  maxStudents: z.coerce
    .number()
    .int("Use a whole number of students.")
    .min(0, "A cap cannot be negative.")
    .max(100_000, "That is more students than any one school has."),
});

export const platformPersonSchema = z.object({
  role: z.enum(["teacher", "student"]),
  name: z.string().trim().min(2, "We need a name.").max(120),
  email: z.string().trim().toLowerCase().email("That is not a valid email address."),
  sectionId: objectIdSchema.optional(),
  // Blank means "generate one and show it once", the same as the school's own
  // add-a-student form.
  password: z.string().min(8, "Use at least 8 characters.").max(200).optional(),
});

export const platformPersonUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "We need a name.").max(120).optional(),
    email: z.string().trim().toLowerCase().email("That is not a valid email address.").optional(),
    sectionId: objectIdSchema.optional(),
    password: z.string().min(8, "Use at least 8 characters.").max(200).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to change.",
  });

export type SetPlanInput = z.infer<typeof setPlanSchema>;
export type PlatformPersonInput = z.infer<typeof platformPersonSchema>;

// ---------------------------------------------------------------------------
// Labs and scheduling
// ---------------------------------------------------------------------------

export const labSchema = z.object({
  name: z.string().trim().min(1, "Give the lab a name.").max(80),
  capacity: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  periodsPerDay: z.coerce
    .number()
    .int("Use a whole number of periods.")
    .min(1, "A lab needs at least one period.")
    .max(12, "12 periods is the most in a school day."),
  firstPeriodStartsAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use a time like 09:00."),
  periodMinutes: z.coerce
    .number()
    .int("Use a whole number of minutes.")
    .min(15, "A period needs at least 15 minutes.")
    .max(240, "240 minutes is the longest a period can run."),
});

export const scheduleSlotSchema = z.object({
  sectionId: objectIdSchema,
  labId: objectIdSchema,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  period: z.coerce.number().int().min(1).max(12),
});

export type LabInputShape = z.infer<typeof labSchema>;
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>;
