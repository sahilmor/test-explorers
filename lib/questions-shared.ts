/**
 * Question constants and pure helpers, with no Mongoose import.
 *
 * The model file pulls in Mongoose, which must never reach the browser bundle.
 * Anything both a client component and the server need lives here instead, and
 * `models/Question.ts` re-exports it so server code has one place to import
 * from.
 */

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Every question has exactly four options — A, B, C, D. */
export const OPTION_COUNT = 4;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

/** "A" | "a" | "1" → 0. Returns null for anything that is not A–D. */
export function parseOptionLetter(input: string): number | null {
  const trimmed = input.trim().toUpperCase();

  const letterIndex = (OPTION_LETTERS as readonly string[]).indexOf(trimmed);
  if (letterIndex !== -1) return letterIndex;

  // Spreadsheets sometimes carry 1–4 instead of A–D.
  if (/^[1-4]$/.test(trimmed)) return Number(trimmed) - 1;

  return null;
}

/** 0 → "A". */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}
