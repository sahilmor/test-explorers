import mongoose, { type QueryFilter } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { escapeRegex, SetupError } from "@/lib/school-setup";
import Question, {
  DIFFICULTIES,
  OPTION_COUNT,
  parseOptionLetter,
  type Difficulty,
  type QuestionDoc,
} from "@/models/Question";
import Subject from "@/models/Subject";
import { parseCsv, toObjects, QUESTION_CSV_COLUMNS } from "@/lib/csv";

/**
 * Question-bank operations.
 *
 * Same shape as `lib/school-setup.ts`: every function takes `schoolId` first,
 * and the only callers are route handlers wrapped in `withAuth`, which can
 * only pass the value from the verified session. Nothing here reads a request.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Refuse a larger file rather than time out halfway through. */
export const MAX_IMPORT_ROWS = 500;

export type QuestionSummaryRow = {
  subjectId: string;
  subjectName: string;
  count: number;
};

/**
 * How many questions exist per subject, including subjects with none — a
 * teacher needs to see the zeroes, because those are the gaps to fill.
 */
export async function questionCountsBySubject(
  schoolId: string
): Promise<QuestionSummaryRow[]> {
  await connectToDatabase();

  const [subjects, counts] = await Promise.all([
    Subject.find({ schoolId }).select("name").sort({ name: 1 }).lean(),
    Question.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
      { $group: { _id: "$subjectId", n: { $sum: 1 } } },
    ]),
  ]);

  const byId = new Map(counts.map((c) => [String(c._id), c.n]));

  return subjects.map((s) => ({
    subjectId: String(s._id),
    subjectName: s.name,
    count: byId.get(String(s._id)) ?? 0,
  }));
}

export type QuestionFilters = {
  subjectId?: string;
  difficulty?: Difficulty;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type QuestionRow = {
  id: string;
  subjectId: string;
  subjectName: string | null;
  text: string;
  imageUrl: string | null;
  options: string[];
  correctOptionIndex: number;
  difficulty: Difficulty;
  createdAt: Date;
};

export type QuestionPage = {
  questions: QuestionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listQuestions(
  schoolId: string,
  filters: QuestionFilters = {}
): Promise<QuestionPage> {
  await connectToDatabase();

  // The school filter goes on first. Everything below can only narrow it.
  const query: QueryFilter<QuestionDoc> = { schoolId };

  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.difficulty) query.difficulty = filters.difficulty;
  if (filters.search) {
    // Escaped, so a search for ".*" matches the literal characters rather
    // than every question in the school.
    query.text = new RegExp(escapeRegex(filters.search), "i");
  }

  const pageSize = Math.min(
    Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  const page = Math.max(1, filters.page ?? 1);

  const [total, questions, subjects] = await Promise.all([
    Question.countDocuments(query),
    Question.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Subject.find({ schoolId }).select("name").lean(),
  ]);

  const subjectName = new Map(subjects.map((s) => [String(s._id), s.name]));

  return {
    questions: questions.map((q) => ({
      id: String(q._id),
      subjectId: String(q.subjectId),
      subjectName: subjectName.get(String(q.subjectId)) ?? null,
      text: q.text,
      imageUrl: q.imageUrl ?? null,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      difficulty: q.difficulty as Difficulty,
      createdAt: q.createdAt,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Confirms a subject id belongs to this school before anything is stored. */
async function assertOwnedSubject(schoolId: string, subjectId: string) {
  const subject = await Subject.findOne({ _id: subjectId, schoolId })
    .select("_id name")
    .lean();

  if (!subject) {
    throw new SetupError(
      "Pick a subject that exists in your school.",
      400,
      "subjectId"
    );
  }

  return subject;
}

export type QuestionInputFields = {
  subjectId: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  difficulty: Difficulty;
  imageUrl?: string | null;
};

export async function createQuestion(
  schoolId: string,
  createdBy: string,
  input: QuestionInputFields
) {
  await connectToDatabase();

  const subject = await assertOwnedSubject(schoolId, input.subjectId);

  const question = await Question.create({
    schoolId, // from the token. Never from the body.
    subjectId: subject._id,
    createdBy,
    text: input.text,
    options: input.options,
    correctOptionIndex: input.correctOptionIndex,
    difficulty: input.difficulty,
    imageUrl: input.imageUrl || null,
  });

  return {
    id: String(question._id),
    subjectId: String(question.subjectId),
    subjectName: subject.name,
    text: question.text,
    options: question.options,
    correctOptionIndex: question.correctOptionIndex,
    difficulty: question.difficulty as Difficulty,
    imageUrl: question.imageUrl ?? null,
  };
}

export async function updateQuestion(
  schoolId: string,
  id: string,
  input: QuestionInputFields
) {
  await connectToDatabase();

  const subject = await assertOwnedSubject(schoolId, input.subjectId);

  // schoolId is part of the filter, so an id from another school matches
  // nothing and comes back as a plain 404.
  const updated = await Question.findOneAndUpdate(
    { _id: id, schoolId },
    {
      $set: {
        subjectId: subject._id,
        text: input.text,
        options: input.options,
        correctOptionIndex: input.correctOptionIndex,
        difficulty: input.difficulty,
        imageUrl: input.imageUrl || null,
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new SetupError("No such question.", 404);

  return {
    id: String(updated._id),
    subjectId: String(updated.subjectId),
    subjectName: subject.name,
    text: updated.text,
    options: updated.options,
    correctOptionIndex: updated.correctOptionIndex,
    difficulty: updated.difficulty as Difficulty,
    imageUrl: updated.imageUrl ?? null,
  };
}

export async function deleteQuestion(schoolId: string, id: string) {
  await connectToDatabase();

  const result = await Question.deleteOne({ _id: id, schoolId });
  if (result.deletedCount === 0) {
    throw new SetupError("No such question.", 404);
  }

  return { id };
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type QuestionImportRowResult = {
  line: number;
  subject: string;
  question: string;
  status: "created" | "skipped";
  reason?: string;
};

export type QuestionImportSummary = {
  created: number;
  skipped: number;
  results: QuestionImportRowResult[];
};

/**
 * Creates questions from raw CSV text.
 *
 * As with the student import: one bad row never fails the batch. Each row is
 * validated on its own, the good ones are created, and every skipped row comes
 * back with the line number it came from and the specific reason.
 */
export async function importQuestionsFromCsv(
  schoolId: string,
  createdBy: string,
  csvText: string
): Promise<QuestionImportSummary> {
  await connectToDatabase();

  // Throws CsvError for a malformed file or a missing column; the route turns
  // that into a 400 carrying the parser's own message.
  const records = toObjects(parseCsv(csvText), QUESTION_CSV_COLUMNS);

  if (records.length > MAX_IMPORT_ROWS) {
    throw new SetupError(
      `That file has ${records.length} rows. Upload at most ${MAX_IMPORT_ROWS} at a time — split the file and run it twice.`,
      413
    );
  }

  // Subjects are resolved by name, within this school only. A file naming
  // another school's subject matches nothing.
  const subjects = await Subject.find({ schoolId }).select("name").lean();
  const subjectByName = new Map(
    subjects.map((s) => [s.name.trim().toLowerCase(), s._id])
  );

  const results: QuestionImportRowResult[] = [];
  const toCreate: {
    index: number;
    doc: Record<string, unknown>;
  }[] = [];

  for (const { line, record } of records) {
    const subjectName = record.subject ?? "";
    const text = record.question ?? "";
    const options = [
      record.optiona ?? "",
      record.optionb ?? "",
      record.optionc ?? "",
      record.optiond ?? "",
    ];
    const correct = record.correct ?? "";
    const difficulty = (record.difficulty ?? "").toLowerCase();

    const skip = (reason: string) => {
      results.push({ line, subject: subjectName, question: text, status: "skipped", reason });
    };

    const everythingBlank =
      !subjectName && !text && options.every((o) => !o) && !correct && !difficulty;
    if (everythingBlank) {
      skip("The row is blank.");
      continue;
    }

    if (!subjectName) {
      skip("Missing a subject.");
      continue;
    }
    const subjectId = subjectByName.get(subjectName.trim().toLowerCase());
    if (!subjectId) {
      skip(`No subject called "${subjectName}". Create it first, or fix the spelling.`);
      continue;
    }

    if (!text.trim()) {
      skip("Missing the question text.");
      continue;
    }

    const missing = options
      .map((o, i) => (o.trim() ? null : String.fromCharCode(65 + i)))
      .filter(Boolean);
    if (missing.length > 0) {
      skip(
        missing.length === OPTION_COUNT
          ? "All four options are empty."
          : `Option ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty. All four are required.`
      );
      continue;
    }

    if (!correct.trim()) {
      skip("Missing the correct option.");
      continue;
    }
    const correctIndex = parseOptionLetter(correct);
    if (correctIndex === null) {
      skip(`"${correct}" isn't a correct option. Use A, B, C or D.`);
      continue;
    }

    if (!difficulty) {
      skip("Missing a difficulty.");
      continue;
    }
    if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) {
      skip(`"${record.difficulty}" isn't a difficulty. Use easy, medium or hard.`);
      continue;
    }

    results.push({ line, subject: subjectName, question: text, status: "created" });
    toCreate.push({
      index: results.length - 1,
      doc: {
        schoolId: new mongoose.Types.ObjectId(schoolId),
        subjectId,
        createdBy: new mongoose.Types.ObjectId(createdBy),
        text: text.trim(),
        options: options.map((o) => o.trim()),
        correctOptionIndex: correctIndex,
        difficulty,
        imageUrl: null,
      },
    });
  }

  if (toCreate.length > 0) {
    try {
      // ordered:false so one rejected document does not abort everything
      // after it.
      await Question.insertMany(
        toCreate.map((r) => r.doc),
        { ordered: false }
      );
    } catch (error) {
      const writeErrors =
        (error as { writeErrors?: { index: number }[] }).writeErrors ?? [];
      if (writeErrors.length === 0) throw error;

      for (const we of writeErrors) {
        const row = toCreate[we.index];
        if (!row) continue;
        const entry = results[row.index];
        entry.status = "skipped";
        entry.reason = "The database rejected this row.";
      }
    }
  }

  const created = results.filter((r) => r.status === "created").length;

  return { created, skipped: results.length - created, results };
}
