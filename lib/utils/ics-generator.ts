export function generateICS(title: string, daysRemaining: number): string {
  const now = new Date();
  const deadline = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);
  const remind30 = new Date(deadline.getTime() - 30 * 24 * 60 * 60 * 1000);
  const remind7 = new Date(deadline.getTime() - 7 * 24 * 60 * 60 * 1000);

  const formatDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const uid = `cq-labor-${Date.now()}@arbitration`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CQ Labor Assistant//CN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${formatDate(deadline)}`,
    `DTEND:${formatDate(deadline)}`,
    `SUMMARY:${title}`,
    "DESCRIPTION:劳动仲裁时效即将到期，请尽快提交申请。\\n拨打12348获取免费法律援助。",
    "BEGIN:VALARM",
    "TRIGGER:-P30D",
    "ACTION:DISPLAY",
    "DESCRIPTION:仲裁时效还剩30天",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-P7D",
    "ACTION:DISPLAY",
    "DESCRIPTION:仲裁时效还剩7天，请立即行动",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(title: string, daysRemaining: number) {
  const content = generateICS(title, daysRemaining);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "仲裁时效提醒.ics";
  link.click();
  URL.revokeObjectURL(url);
}
