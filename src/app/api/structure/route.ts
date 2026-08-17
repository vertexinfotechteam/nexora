import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertCanWrite, requireSession, SessionError } from "@/lib/auth/session";
import { structureRawData } from "@/lib/structure/ai";
import { audit } from "@/lib/store";
import { enforceLimit } from "@/lib/security/guard";

export const maxDuration = 120;

const bodySchema = z.object({
  raw: z.string().trim().min(1).max(20_000),
  currency: z.string().trim().max(8).default("INR"),
});

/**
 * Turns pasted text into line items.
 *
 * Free of charge: this consumes no AI credits. Credits are for analysis runs,
 * and charging for a paste would make people paste less and edit more by hand.
 */
export async function POST(request: NextRequest) {
  // Abuse throttle. Returns a 429 and leaves the success path below
  // exactly as it was.
  const limited = await enforceLimit("ai");
  if (limited) return limited;

  let session;
  try {
    session = await requireSession();
    assertCanWrite(session);
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not permitted." },
      { status },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paste some text to structure." },
      { status: 400 },
    );
  }

  try {
    const result = await structureRawData(parsed.data.raw, parsed.data.currency);

    await audit({
      organization_id: session.organizationId,
      user_id: session.userId,
      action: "document.structured",
      metadata: {
        items: result.items.length,
        usedAi: result.usedAi,
        rejected: result.rejectedAmounts.length,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The text could not be structured.",
      },
      { status: 500 },
    );
  }
}
