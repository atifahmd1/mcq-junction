// ============================================================================
// MCQ Junction — Deterministic Booklet Series & Permutation Engine
// File: src/lib/exam/booklet.ts
// ============================================================================

export interface SeededRng {
  next(): number; // 0 <= x < 1
}

/**
 * Creates a deterministic, seedable pseudo-random number generator (Mulberry32).
 * Given the same seed string, produces the exact identical sequence across runs.
 */
export function createSeededRng(seedStr: string): SeededRng {
  // Hash seed string to 32-bit unsigned integer
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619) >>> 0;
  }

  let state = h;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Deterministic Fisher-Yates array shuffle.
 */
export function deterministicShuffle<T>(items: readonly T[], rng: SeededRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

export interface OccurrenceInput {
  id: string;
  sequenceNumber: number;
  passageId: string | null;
  questionType: string;
  options: Array<{
    id: string;
    optionLabel: string;
    sortOrder: number;
    optionText: string;
  }>;
}

export interface PermutedQuestion {
  occurrenceId: string;
  displaySequence: number;
  passageId: string | null;
  questionType: string;
  optionMappings: Array<{
    sourceOptionId: string;
    displayLabel: string;
    displaySortOrder: number;
    optionText: string;
  }>;
}

export interface BookletPermutationOptions {
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  seed?: string;
}

const DEFAULT_OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * Generates a deterministic permutation of question occurrences and options for a booklet series.
 *
 * Core Invariants:
 * 1. Passage Contiguity: Child questions belonging to the same comprehension passage
 *    remain strictly contiguous as a cohesive unit.
 * 2. Determinism: Given the same seed, produces the exact same permutation.
 * 3. Identity Preservation: Shuffled options maintain bidirectional mapping to original source IDs.
 * 4. Assertion-Reason Integrity: Preserves Assertion-Reason option semantic choices without corruption.
 */
export function generateBookletPermutation(
  occurrences: OccurrenceInput[],
  options: BookletPermutationOptions = {}
): PermutedQuestion[] {
  const { shuffleQuestions = true, shuffleOptions = true, seed = "default-seed" } = options;
  const rng = createSeededRng(seed);

  // 1. Group occurrences into units (standalone questions vs. passage-bound groups)
  interface QuestionUnit {
    passageId: string | null;
    occurrences: OccurrenceInput[];
  }

  const units: QuestionUnit[] = [];
  const passageMap = new Map<string, OccurrenceInput[]>();

  // Sort occurrences initially by sequence number
  const sortedOccurrences = [...occurrences].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  for (const occ of sortedOccurrences) {
    if (occ.passageId) {
      if (!passageMap.has(occ.passageId)) {
        const group: OccurrenceInput[] = [];
        passageMap.set(occ.passageId, group);
        units.push({ passageId: occ.passageId, occurrences: group });
      }
      passageMap.get(occ.passageId)!.push(occ);
    } else {
      units.push({ passageId: null, occurrences: [occ] });
    }
  }

  // 2. Shuffle question units deterministically
  const shuffledUnits = shuffleQuestions ? deterministicShuffle(units, rng) : units;

  // 3. Flatten units into single ordered sequence while preserving passage contiguity
  const orderedOccurrences: OccurrenceInput[] = [];
  for (const unit of shuffledUnits) {
    // Keep relative sequence of questions within a passage intact
    orderedOccurrences.push(...unit.occurrences);
  }

  // 4. Build permuted questions with display sequence and option mappings
  const result: PermutedQuestion[] = [];

  for (let qIdx = 0; qIdx < orderedOccurrences.length; qIdx++) {
    const occ = orderedOccurrences[qIdx]!;
    const displaySequence = qIdx + 1;

    // Sort options by original sortOrder
    const sortedOptions = [...occ.options].sort((a, b) => a.sortOrder - b.sortOrder);

    // Assertion-Reason questions typically have standardized option choices (A, B, C, D)
    // where shuffling labels could confuse standardized logic unless specifically requested.
    const isAssertionReason = occ.questionType === "ASSERTION_REASON";
    const shouldShuffleOptions = shuffleOptions && !isAssertionReason;

    const finalOptions = shouldShuffleOptions
      ? deterministicShuffle(sortedOptions, rng)
      : sortedOptions;

    const optionMappings = finalOptions.map((opt, optIdx) => {
      const displayLabel = DEFAULT_OPTION_LABELS[optIdx] ?? String.fromCharCode(65 + optIdx);
      return {
        sourceOptionId: opt.id,
        displayLabel,
        displaySortOrder: optIdx + 1,
        optionText: opt.optionText,
      };
    });

    result.push({
      occurrenceId: occ.id,
      displaySequence,
      passageId: occ.passageId,
      questionType: occ.questionType,
      optionMappings,
    });
  }

  return result;
}
