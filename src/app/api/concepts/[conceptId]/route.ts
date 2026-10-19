// ============================================================================
// MCQ Junction — Detailed Concept API Endpoint
// File: src/app/api/concepts/[conceptId]/route.ts
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getDetailedConceptById, ConceptNotFoundError, ConceptForbiddenError } from "@/lib/concept/service";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conceptId: string }> }
) {
  const { conceptId } = await context.params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(conceptId)) {
    return NextResponse.json(
      { error: "Invalid concept ID format: must be a valid UUID" },
      { status: 400 }
    );
  }

  // Determine user role if authenticated
  let userRole: Role = Role.STUDENT;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      if (dbUser) {
        userRole = dbUser.role;
      }
    }
  } catch {
    // If auth resolution fails, treat as guest/student
    userRole = Role.STUDENT;
  }

  try {
    const concept = await getDetailedConceptById(conceptId, userRole);
    return NextResponse.json({ success: true, data: concept });
  } catch (err) {
    if (err instanceof ConceptNotFoundError) {
      return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }
    if (err instanceof ConceptForbiddenError) {
      return NextResponse.json(
        { error: "Forbidden: Unpublished concept is restricted to administrators" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving concept details" },
      { status: 500 }
    );
  }
}
