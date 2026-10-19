import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PublishReviewClient, { type GateCheck } from "./PublishReviewClient";

export const instant = false;

interface PublishPageProps {
  params: Promise<{
    paperId: string;
  }>;
}

export default async function PublicationReviewPage({ params }: PublishPageProps) {
  await connection();
  const { paperId } = await params;

  let paper = null;

  try {
    paper = await prisma.examPaper.findUnique({
      where: { id: paperId },
      include: {
        session: {
          include: {
            exam: {
              include: {
                conductingBody: true,
              },
            },
          },
        },
        occurrences: {
          orderBy: { sequenceNumber: "asc" },
          include: {
            representations: {
              select: { editorialVerified: true },
            },
          },
        },
        bookletSeries: {
          where: { isMasterSeries: true },
          select: { id: true, seriesCode: true },
        },
        answerKeyVersions: {
          where: { isOfficial: true },
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            items: {
              where: { keyStatus: "ACTIVE" },
              select: { occurrenceId: true },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Database failure while querying publication readiness:", err);
  }

  if (!paper) {
    notFound();
  }

  // Evaluate Publication Gates (mirroring fn_publish_exam_paper domain rules)
  const totalExpected = paper.totalQuestions;
  const actualOccurrences = paper.occurrences.length;

  // Gate 1: Publish Status Verification
  const isVerified = paper.publishStatus === "VERIFIED";
  const isAlreadyPublished = paper.publishStatus === "PUBLISHED";
  const gateStatusPassed = isVerified || isAlreadyPublished;

  // Gate 2: Question Count Alignment
  const gateCountPassed = actualOccurrences === totalExpected && totalExpected > 0;

  // Gate 3: Sequence Contiguity (1..N with 0 gaps)
  let gateSeqPassed = true;
  let gapDetail = "None (Contiguous 1.." + totalExpected + ")";
  if (actualOccurrences !== totalExpected) {
    gateSeqPassed = false;
    gapDetail = `Found ${actualOccurrences} occurrences; expected ${totalExpected}`;
  } else {
    for (let i = 0; i < actualOccurrences; i++) {
      if (paper.occurrences[i].sequenceNumber !== i + 1) {
        gateSeqPassed = false;
        gapDetail = `Discontinuity at index ${i}: sequence #${paper.occurrences[i].sequenceNumber} != ${i + 1}`;
        break;
      }
    }
  }

  // Gate 4: Editorial Verification
  const verifiedOccurrences = paper.occurrences.filter((occ) =>
    occ.representations.some((rep) => rep.editorialVerified)
  ).length;
  const gateEditorialPassed = verifiedOccurrences === actualOccurrences && actualOccurrences > 0;

  // Gate 5: Master Booklet Series
  const masterSeries = paper.bookletSeries[0];
  const gateBookletPassed = !!masterSeries;

  // Gate 6: Official Answer Key Coverage
  const officialKey = paper.answerKeyVersions[0];
  const activeKeyItems = officialKey?.items.length ?? 0;
  const gateKeyPassed = activeKeyItems === totalExpected && totalExpected > 0;

  const gates: GateCheck[] = [
    {
      id: "gate-status",
      title: "Gate 1: Paper Verification Status",
      description: "Exam paper must be in VERIFIED state before publication.",
      passed: gateStatusPassed,
      actual: paper.publishStatus,
      expected: isAlreadyPublished ? "PUBLISHED" : "VERIFIED",
    },
    {
      id: "gate-count",
      title: "Gate 2: Question Occurrence Count",
      description: "Actual occurrences in paper must equal declared total question count.",
      passed: gateCountPassed,
      actual: `${actualOccurrences} questions`,
      expected: `${totalExpected} questions`,
    },
    {
      id: "gate-seq",
      title: "Gate 3: Sequence Contiguity",
      description: "Sequence numbers must form a strictly contiguous series from 1 to total questions without numbering gaps.",
      passed: gateSeqPassed,
      actual: gapDetail,
      expected: `Contiguous series 1..${totalExpected}`,
    },
    {
      id: "gate-editorial",
      title: "Gate 4: Editorial Verification",
      description: "All question representations must have editorial sign-off before public release.",
      passed: gateEditorialPassed,
      actual: `${verifiedOccurrences} of ${actualOccurrences} verified`,
      expected: `${actualOccurrences} of ${actualOccurrences} verified`,
    },
    {
      id: "gate-booklet",
      title: "Gate 5: Master Booklet Series",
      description: "Paper must have a designated master booklet series configuration.",
      passed: gateBookletPassed,
      actual: masterSeries ? `Series ${masterSeries.seriesCode}` : "None found",
      expected: "1 Master Series Configured",
    },
    {
      id: "gate-key",
      title: "Gate 6: Official Answer Key Coverage",
      description: "Active official answer key must provide target coverage for 100% of question occurrences.",
      passed: gateKeyPassed,
      actual: `${activeKeyItems} active targets (Key ${officialKey ? "v" + officialKey.versionNumber : "Missing"})`,
      expected: `${totalExpected} active targets`,
    },
  ];

  const allGatesPassed = gates.every((g) => g.passed);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
          <Link href="/admin" className="hover:text-[#F1F2F3] transition">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/papers" className="hover:text-[#F1F2F3] transition">
            Exam Papers
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#D6B36A]">Publication Review</span>
        </nav>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#D6B36A]">
                {paper.paperCode}
              </span>
              <span className="text-[#717780]">&bull;</span>
              <span className="text-xs text-[#717780]">
                {paper.session.exam.conductingBody.code} &bull; {paper.session.exam.title}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F1F2F3] sm:text-3xl">
              Publication Review — {paper.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/admin/papers/${paper.id}/sequence`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Question Sequence
            </Link>
            <Link
              href={`/admin/papers/${paper.id}/adjudication`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Answer Keys
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Gate Review Client */}
      <PublishReviewClient
        paperId={paper.id}
        paperCode={paper.paperCode}
        paperTitle={paper.title}
        currentStatus={paper.publishStatus}
        allGatesPassed={allGatesPassed}
        gates={gates}
      />
    </div>
  );
}
