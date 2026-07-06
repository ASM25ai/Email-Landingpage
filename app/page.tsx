// app/get-approved/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Config ──────────────────────────────────────────────
// GHL webhook URL — create a Workflow in GHL with an Inbound Webhook trigger
// and paste the webhook URL here
const WEBHOOK_URL = "YOUR_GHL_WEBHOOK_URL_HERE";

// Vercel API route that uploads files to GHL media library
// and links them to the contact's custom field
const FILE_UPLOAD_API = "/api/upload-to-ghl";

// ── URL Params ──────────────────────────────────────────
// All fields are passed from GHL campaign link as query params
// Empty/missing params are handled gracefully — the page adapts
function getParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => (p.get(k) || "").trim();
  return {
    name: get("name"),
    firstName: (get("name")).split(" ")[0],
    email: get("email"),
    phone: get("phone"),
    contactId: get("contactId"),
    income: parseInt(get("income") || "0", 10),
    additionalIncome: get("additionalIncome"),
    vehicleType: get("vehicleType"),
    tradeIn: get("tradeIn"),
    employer: get("employer"),
    employmentStatus: get("employmentStatus"),
    jobTitle: get("jobTitle"),
    timeAtJob: get("timeAtJob"),
    license: get("license"),
    dob: get("dob"),
    cosigner: get("cosigner"),
  };
}

type Params = ReturnType<typeof getParams>;

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Detect non-traditional employment (disability, EI, social assistance, etc.)
// These leads get different copy — "proof of income" instead of "paystub"
function isNonTraditionalIncome(employer?: string, employmentStatus?: string) {
  const keywords = [
    "disability", "ctb", "odsp", "ei ", "cerb", "social assistance",
    "welfare", "cpp", "oas", "gis", "self-employed", "self employed",
    "unemployed", "retired", "pension", "student", "n/a", "none",
    "no employer", "child benefit", "ow ", "ontario works",
  ];
  const combined = `${employer || ""} ${employmentStatus || ""}`.toLowerCase();
  return keywords.some((kw) => combined.includes(kw));
}

// Build human-readable income source label from whatever CRM has
function incomeLabel(params: Params) {
  if (!params.employer && !params.employmentStatus) return "";
  if (isNonTraditionalIncome(params.employer, params.employmentStatus)) {
    return params.employer || params.employmentStatus || "";
  }
  // Traditional employment — combine without duplicating
  const parts: string[] = [];
  if (params.employer) parts.push(params.employer);
  if (
    params.jobTitle &&
    params.jobTitle.toLowerCase() !== params.employer?.toLowerCase()
  )
    parts.push(params.jobTitle);
  if (
    params.employmentStatus &&
    params.employmentStatus.toLowerCase() !== params.employer?.toLowerCase() &&
    params.employmentStatus.toLowerCase() !== params.jobTitle?.toLowerCase()
  )
    parts.push(params.employmentStatus);
  return parts.join(" · ");
}

// ── Palette ─────────────────────────────────────────────
const C = {
  navy: "#0B1D33",
  navyLight: "#132B4A",
  gold: "#C9A84C",
  goldDark: "#A8872E",
  white: "#FFFFFF",
  offWhite: "#F7F8FA",
  gray100: "#EEF0F4",
  gray300: "#C5CAD3",
  gray500: "#6B7385",
  gray700: "#3A3F4B",
  green: "#22A85A",
  greenBg: "#E8F9EF",
  red: "#D94452",
  bg: "#F1F3F7",
};

// ── Sub-components ──────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = (step / total) * 100;
  return (
    <div style={{ width: "100%", marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: C.gray500, fontWeight: 500 }}>
          Step {step} of {total}
        </span>
        <span style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.gray100 }}>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${C.gold}, ${C.goldDark})`,
            width: `${pct}%`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function Label({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: sub ? 2 : 6,
        fontSize: 14,
        fontWeight: 600,
        color: C.navy,
        lineHeight: 1.3,
      }}
    >
      {children}
      {sub && (
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 400,
            color: C.gray500,
            marginTop: 2,
          }}
        >
          {sub}
        </span>
      )}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "12px 14px",
        fontSize: 15,
        border: `1.5px solid ${disabled ? C.gray100 : C.gray300}`,
        borderRadius: 8,
        outline: "none",
        background: disabled ? C.offWhite : C.white,
        color: disabled ? C.gray500 : C.navy,
        boxSizing: "border-box",
        transition: "border-color 0.2s",
      }}
      onFocus={(e) => {
        if (!disabled) e.target.style.borderColor = C.gold;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = disabled ? C.gray100 : C.gray300;
      }}
    />
  );
}

type Option = { value: string; label: string; icon?: string };

function OptionCards({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 10,
      }}
    >
      {options.map((o) => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: "14px 10px",
              borderRadius: 10,
              cursor: "pointer",
              border: `2px solid ${sel ? C.gold : C.gray100}`,
              background: sel ? "#FBF6E9" : C.white,
              color: sel ? C.navy : C.gray700,
              fontWeight: sel ? 700 : 500,
              fontSize: 14,
              transition: "all 0.2s",
              textAlign: "center",
            }}
          >
            {o.icon && (
              <span style={{ display: "block", fontSize: 22, marginBottom: 4 }}>
                {o.icon}
              </span>
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Only renders if value is truthy — safe to call on any CRM field
function ConfirmedField({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string;
  icon: string;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: C.greenBg,
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: C.gray500,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 14,
            color: C.navy,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      </div>
      <span
        style={{ color: C.green, fontSize: 12, fontWeight: 600, flexShrink: 0 }}
      >
        ✓ On file
      </span>
    </div>
  );
}

function FileUploadZone({
  label,
  sub,
  files,
  setFiles,
  multiple = false,
  accept = "image/*",
}: {
  label?: string;
  sub?: string;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  multiple?: boolean;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (fl: FileList) => {
    const arr = Array.from(fl);
    if (multiple) setFiles((p) => [...p, ...arr].slice(0, 4));
    else setFiles(arr.slice(0, 1));
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {label && <Label sub={sub}>{label}</Label>}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => ref.current?.click()}
        style={{
          border: `2px dashed ${drag ? C.gold : C.gray300}`,
          borderRadius: 10,
          padding: "28px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: drag ? "#FBF6E9" : C.offWhite,
          transition: "all 0.2s",
        }}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📤</div>
        <div style={{ fontSize: 14, color: C.gray500 }}>
          {multiple ? "Tap to upload photos (up to 4)" : "Tap to upload file"}
        </div>
        <div style={{ fontSize: 12, color: C.gray300, marginTop: 4 }}>
          JPG, PNG, or PDF · Max 10MB
        </div>
      </div>
      {files.length > 0 && (
        <div
          style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: C.gray100,
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
              }}
            >
              <span style={{ color: C.green }}>✓</span>
              <span
                style={{
                  color: C.gray700,
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFiles((p) => p.filter((_, j) => j !== i));
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: C.red,
                  cursor: "pointer",
                  fontSize: 15,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────
export default function GetApprovedPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [params, setParams] = useState<Params>({} as Params);

  // Step 1
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactId, setContactId] = useState("");

  // Step 2
  const [creditScore, setCreditScore] = useState("");
  const [newcomer, setNewcomer] = useState("");
  const [cosigner, setCosigner] = useState("");

  // Step 3
  const [wantsTrade, setWantsTrade] = useState("");
  const [tradeVehicle, setTradeVehicle] = useState("");
  const [tradeFinanced, setTradeFinanced] = useState("");
  const [tradeMileage, setTradeMileage] = useState("");
  const [tradePhotos, setTradePhotos] = useState<File[]>([]);

  // Step 4
  const [paystubFiles, setPaystubFiles] = useState<File[]>([]);

  // Pre-fill from URL
  useEffect(() => {
    const p = getParams();
    setParams(p);
    if (p.name) setName(p.name);
    if (p.email) setEmail(p.email);
    if (p.phone) setPhone(formatPhone(p.phone));
    if (p.contactId) setContactId(p.contactId);
    if (p.tradeIn) {
      setWantsTrade("yes");
      setTradeVehicle(p.tradeIn);
    }
    if (p.cosigner) {
      const cv = p.cosigner.toLowerCase();
      if (cv === "yes" || cv === "true") setCosigner("yes");
      else if (cv === "no" || cv === "false" || cv === "none") setCosigner("no");
    }
  }, []);

  // ── Derived ──
  const crmIncome = params.income || 0;
  const needsCosigner = crmIncome > 0 && crmIncome < 2000 && !params.cosigner;
  const isNonTrad = isNonTraditionalIncome(params.employer, params.employmentStatus);

  // Build confirmed fields dynamically — only truthy values render
  const confirmedFields: { icon: string; label: string; value: string }[] = [];

  if (params.employer || params.employmentStatus) {
    const src = incomeLabel(params);
    if (src) {
      confirmedFields.push({
        icon: isNonTrad ? "📋" : "🏢",
        label: isNonTrad ? "Income Source" : "Employer",
        value: src,
      });
    }
  }
  if (crmIncome > 0) {
    let incomeDisplay = `$${crmIncome.toLocaleString()}/mo`;
    if (params.additionalIncome) incomeDisplay += ` + ${params.additionalIncome}`;
    confirmedFields.push({ icon: "💰", label: "Monthly Income", value: incomeDisplay });
  }
  if (params.license) {
    confirmedFields.push({ icon: "🪪", label: "Driver's License", value: params.license });
  }
  if (params.vehicleType) {
    confirmedFields.push({ icon: "🚗", label: "Looking For", value: params.vehicleType });
  }
  if (params.timeAtJob && !isNonTrad) {
    confirmedFields.push({ icon: "📅", label: "Time at Job", value: params.timeAtJob });
  }

  // ── Validation ──
  const canNext = useCallback(() => {
    if (step === 1)
      return name.trim() && email.trim() && phone.replace(/\D/g, "").length === 10;
    if (step === 2) {
      if (!creditScore || !newcomer) return false;
      if (needsCosigner && !cosigner) return false;
      return true;
    }
    if (step === 3) {
      if (!wantsTrade) return false;
      if (wantsTrade === "yes")
        return tradeVehicle.trim() && tradeFinanced && tradeMileage.trim();
      return true;
    }
    return true;
  }, [
    step, name, email, phone, creditScore, newcomer,
    needsCosigner, cosigner, wantsTrade, tradeVehicle,
    tradeFinanced, tradeMileage,
  ]);

  // ── File upload to GHL ──
  async function uploadFilesToGHL(files: File[], fieldKey: string) {
    if (!files.length || !contactId) return [];
    const urls: string[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contactId", contactId);
      fd.append("fieldKey", fieldKey);
      try {
        const res = await fetch(FILE_UPLOAD_API, { method: "POST", body: fd });
        const data = await res.json();
        if (data.url) urls.push(data.url);
      } catch (e) {
        console.error("Upload failed:", e);
      }
    }
    return urls;
  }

  async function handleSubmit() {
    setSubmitting(true);

    // Upload files first
    let tradePhotoUrls: string[] = [];
    let paystubUrls: string[] = [];
    if (tradePhotos.length)
      tradePhotoUrls = await uploadFilesToGHL(tradePhotos, "trade_in_photos");
    if (paystubFiles.length)
      paystubUrls = await uploadFilesToGHL(paystubFiles, "paystub");

    // Then send all form data via webhook
    const payload = {
      name,
      email,
      phone: phone.replace(/\D/g, ""),
      contactId,
      creditScore,
      newcomer,
      cosigner: needsCosigner ? cosigner : params.cosigner || "not_asked",
      wantsTrade,
      tradeVehicle: wantsTrade === "yes" ? tradeVehicle : "",
      tradeFinanced: wantsTrade === "yes" ? tradeFinanced : "",
      tradeMileage: wantsTrade === "yes" ? tradeMileage : "",
      tradePhotoUrls,
      paystubUrls,
      source: "reengagement_landing_page",
    };

    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Webhook error:", e);
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "48px 28px",
            maxWidth: 440,
            width: "90%",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: C.greenBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: 36,
            }}
          >
            ✓
          </div>
          <h2
            style={{
              color: C.navy,
              fontSize: 24,
              marginBottom: 10,
              fontWeight: 700,
            }}
          >
            You're All Set{params.firstName ? `, ${params.firstName}` : ""}!
          </h2>
          <p
            style={{
              color: C.gray500,
              fontSize: 15,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Your finance manager now has everything they need. They'll reach out
            shortly with your personalized
            {params.vehicleType
              ? ` ${params.vehicleType.toLowerCase()}`
              : " vehicle"}{" "}
            options and financing details.
          </p>
          <div
            style={{
              marginTop: 28,
              padding: "14px 20px",
              background: "#FBF6E9",
              borderRadius: 10,
              border: `1px solid ${C.gold}22`,
            }}
          >
            <p
              style={{
                color: C.goldDark,
                fontSize: 13,
                fontWeight: 600,
                margin: 0,
              }}
            >
              📞 Expect a call within 24 hours
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Adaptive paystub copy ──
  const paystubHeading = isNonTrad ? "Proof of Income" : "Income Verification";
  const paystubDescription = isNonTrad
    ? "Upload your most recent benefit statement, bank deposit screenshot, or any document showing your income."
    : params.employer
      ? `Upload your most recent paystub from ${params.employer} to verify your income and finalize your approval.`
      : "Upload your most recent paystub or proof of income to finalize your approval.";
  const paystubLabel = isNonTrad
    ? "Benefit Statement or Bank Screenshot"
    : "Recent Paystub";
  const paystubSub = isNonTrad
    ? "Benefit letter, direct deposit screenshot, or any proof of income"
    : "Your most recent paystub or proof of income";

  // ── Render ──
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Hero */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`,
          padding: "32px 20px 26px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 20,
              background: `${C.gold}22`,
              border: `1px solid ${C.gold}44`,
              fontSize: 11,
              fontWeight: 700,
              color: C.gold,
              letterSpacing: 0.8,
              marginBottom: 14,
              textTransform: "uppercase",
            }}
          >
            Action Required
          </div>
          <h1
            style={{
              color: C.white,
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 10px",
              lineHeight: 1.3,
            }}
          >
            {params.firstName
              ? `${params.firstName}, Your Finance Manager Has an Update`
              : "Your Finance Manager Has Reviewed Your Application"}
          </h1>
          <p style={{ color: "#A9B8CC", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            {params.vehicleType
              ? `We're putting together customized ${params.vehicleType.toLowerCase()} options for you. Just a few details left to finalize your approval.`
              : "We just need a few more details to finalize your customized vehicle options and get you on the road."}
          </p>
        </div>
      </div>

      {/* Form card */}
      <div style={{ maxWidth: 480, margin: "-12px auto 40px", padding: "0 16px" }}>
        <div
          style={{
            background: C.white,
            borderRadius: 16,
            padding: "24px 22px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <ProgressBar step={step} total={4} />

          {/* ═══ STEP 1: Contact ═══ */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 18, color: C.navy, margin: "0 0 4px", fontWeight: 700 }}>
                Confirm Your Details
              </h2>
              <p style={{ fontSize: 13, color: C.gray500, margin: "0 0 16px" }}>
                Make sure we can reach you with your financing options.
              </p>

              {confirmedFields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {confirmedFields.map((f, i) => (
                    <ConfirmedField key={i} icon={f.icon} label={f.label} value={f.value} />
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <Label>Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label>Email Address</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <Label>Phone Number</Label>
                <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(647) 555-0123" type="tel" />
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Financial Profile ═══ */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 18, color: C.navy, margin: "0 0 4px", fontWeight: 700 }}>
                Your Financial Profile
              </h2>
              <p style={{ fontSize: 13, color: C.gray500, margin: "0 0 20px" }}>
                This helps us match you with the best financing option.
              </p>

              <div style={{ marginBottom: 20 }}>
                <Label sub="How would you rate your credit right now?">
                  Estimated Credit Score
                </Label>
                <OptionCards
                  columns={2}
                  value={creditScore}
                  onChange={setCreditScore}
                  options={[
                    { value: "excellent", label: "Excellent", icon: "🌟" },
                    { value: "good", label: "Good", icon: "👍" },
                    { value: "fair", label: "Fair", icon: "📊" },
                    { value: "rebuilding", label: "Rebuilding", icon: "🔧" },
                  ]}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <Label sub="Are you a newcomer to Canada, or have you lived here for a while?">
                  Status in Canada
                </Label>
                <OptionCards
                  columns={2}
                  value={newcomer}
                  onChange={setNewcomer}
                  options={[
                    { value: "newcomer", label: "Newcomer (< 3 yrs)", icon: "🍁" },
                    { value: "established", label: "Established Resident", icon: "🏠" },
                  ]}
                />
              </div>

              {needsCosigner && (
                <div
                  style={{
                    padding: 16,
                    background: "#FFF9EB",
                    borderRadius: 10,
                    border: `1px solid ${C.gold}33`,
                    animation: "fadeIn 0.3s ease",
                  }}
                >
                  <Label sub="Having a co-signer can strengthen your application and unlock better rates.">
                    Do you have a co-signer available?
                  </Label>
                  <OptionCards
                    columns={3}
                    value={cosigner}
                    onChange={setCosigner}
                    options={[
                      { value: "yes", label: "Yes", icon: "✅" },
                      { value: "no", label: "No", icon: "—" },
                      { value: "maybe", label: "Not Sure", icon: "🤔" },
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 3: Trade-In ═══ */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 18, color: C.navy, margin: "0 0 4px", fontWeight: 700 }}>
                Trade-In Vehicle
              </h2>
              <p style={{ fontSize: 13, color: C.gray500, margin: "0 0 20px" }}>
                {params.tradeIn
                  ? `We have your ${params.tradeIn} on file. Confirm the details below so we can factor it into your deal.`
                  : "Do you have a vehicle you'd like to trade in?"}
              </p>

              {!params.tradeIn && (
                <div style={{ marginBottom: 20 }}>
                  <OptionCards
                    columns={2}
                    value={wantsTrade}
                    onChange={setWantsTrade}
                    options={[
                      { value: "yes", label: "Yes, I have a trade-in", icon: "🚗" },
                      { value: "no", label: "No trade-in", icon: "➡️" },
                    ]}
                  />
                </div>
              )}

              {wantsTrade === "yes" && (
                <div style={{ animation: "fadeIn 0.3s ease" }}>
                  <div style={{ marginBottom: 16 }}>
                    <Label sub="Year, make, model, and trim">
                      Which vehicle are you trading in?
                    </Label>
                    <Input
                      value={tradeVehicle}
                      onChange={(e) => setTradeVehicle(e.target.value)}
                      placeholder="e.g. 2019 Honda Civic EX"
                      disabled={!!params.tradeIn}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <Label>Are you currently financing this vehicle?</Label>
                    <OptionCards
                      columns={3}
                      value={tradeFinanced}
                      onChange={setTradeFinanced}
                      options={[
                        { value: "yes_financing", label: "Yes" },
                        { value: "no_owned", label: "No, paid off" },
                        { value: "unsure", label: "Unsure" },
                      ]}
                    />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <Label>Current Mileage (km)</Label>
                    <Input
                      value={tradeMileage}
                      onChange={(e) =>
                        setTradeMileage(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="e.g. 145000"
                    />
                  </div>
                  <FileUploadZone
                    label="Vehicle Photos"
                    sub="Exterior shots and odometer — helps us get you the best trade value."
                    files={tradePhotos}
                    setFiles={setTradePhotos}
                    multiple
                    accept="image/*"
                  />
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 4: Paystub ═══ */}
          {step === 4 && (
            <div>
              <h2 style={{ fontSize: 18, color: C.navy, margin: "0 0 4px", fontWeight: 700 }}>
                {paystubHeading}
              </h2>
              <p style={{ fontSize: 13, color: C.gray500, margin: "0 0 20px" }}>
                {paystubDescription}
              </p>

              <FileUploadZone
                label={paystubLabel}
                sub={paystubSub}
                files={paystubFiles}
                setFiles={setPaystubFiles}
                accept="image/*,.pdf"
              />

              <div
                style={{
                  marginTop: 12,
                  padding: "12px 16px",
                  background: C.offWhite,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🔒</span>
                <p
                  style={{
                    fontSize: 12,
                    color: C.gray500,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Your documents are encrypted and only shared with your assigned
                  finance manager. We never sell or share your personal information.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                style={{
                  flex: "0 0 auto",
                  padding: "14px 20px",
                  borderRadius: 10,
                  border: `1.5px solid ${C.gray300}`,
                  background: C.white,
                  color: C.gray700,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: canNext()
                    ? `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`
                    : C.gray100,
                  color: canNext() ? C.white : C.gray300,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: canNext() ? "pointer" : "default",
                  boxShadow: canNext() ? `0 4px 12px ${C.gold}44` : "none",
                  transition: "all 0.2s",
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: `linear-gradient(135deg, ${C.green}, #1B8F4B)`,
                  color: C.white,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: `0 4px 12px ${C.green}44`,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? "Uploading & Submitting..."
                  : "Submit & Get My Options ✓"}
              </button>
            )}
          </div>
        </div>

        {/* Trust footer */}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <p style={{ fontSize: 12, color: C.gray500, margin: "0 0 6px" }}>
            Trusted by 5,000+ Canadians · All credit types welcome
          </p>
          <p style={{ fontSize: 11, color: C.gray300 }}>
            Direct Finance · directfinance.ca
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
        input::placeholder { color: ${C.gray300}; }
      `}</style>
    </div>
  );
}
