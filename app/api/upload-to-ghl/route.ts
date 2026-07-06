// app/api/upload-to-ghl/route.ts
//
// Uploads files (paystub, trade-in photos) to GHL media library
// then updates the contact's custom field with the file URL.
//
// Required Vercel environment variables:
//   GHL_API_KEY      → Sub-account Private Integration token
//                      (NOT agency-level — that requires OAuth flow)
//                      Go to: Sub-account → Settings → Integrations →
//                      Private Integrations → Create →
//                      Scopes: Contacts (read/write), Media Library (write)
//
//   GHL_LOCATION_ID  → QDrXqmUw1GFEgfDE2VDr (Direct Finance)

import { NextRequest, NextResponse } from "next/server";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_BASE = "https://services.leadconnectorhq.com";

// ── Custom Field Keys ─────────────────────────────────
// Using the GHL field KEY (visible in Settings → Custom Fields → click field)
// The UI shows "Key: contact.tradein_photos" — strip "contact." prefix
const FIELD_MAP: Record<string, string> = {
  paystub: "pay_stub",                // GHL Key: contact.pay_stub
  trade_in_photos: "tradein_photos",  // GHL Key: contact.tradein_photos
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const contactId = formData.get("contactId") as string | null;
    const fieldKey = formData.get("fieldKey") as string | null;

    if (!file || !contactId || !fieldKey) {
      return NextResponse.json(
        { error: "Missing file, contactId, or fieldKey" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Max 10MB." },
        { status: 400 }
      );
    }

    // ── Step 1: Upload file to GHL media library ──
    const uploadForm = new FormData();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const blob = new Blob([fileBuffer], { type: file.type });
    uploadForm.append("file", blob, file.name);
    uploadForm.append("fileProcessingType", "static");

    const uploadRes = await fetch(`${GHL_BASE}/medias/upload-file`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_KEY}`,
        Version: "2021-07-28",
      },
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("GHL media upload failed:", uploadRes.status, errText);
      return NextResponse.json(
        { error: "File upload to GHL failed", detail: errText },
        { status: 500 }
      );
    }

    const uploadData = await uploadRes.json();
    const fileUrl = uploadData.url || uploadData.fileUrl || "";

    if (!fileUrl) {
      console.error("No file URL in GHL response:", uploadData);
      return NextResponse.json(
        { error: "No file URL returned from GHL" },
        { status: 500 }
      );
    }

    // ── Step 2: Update contact's custom field with file URL ──
    const customFieldKey = FIELD_MAP[fieldKey];
    if (customFieldKey) {
      const updateRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          customFields: [
            {
              key: customFieldKey,
              field_value: fileUrl,
            },
          ],
        }),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error("GHL contact update failed:", updateRes.status, errText);
        // File was uploaded to media library — just not linked to contact yet
        // Return success with the URL so the webhook payload still has it
      }
    }

    return NextResponse.json({ url: fileUrl, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Upload handler error:", message);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 }
    );
  }
}
