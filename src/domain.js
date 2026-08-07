export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function addCalendarMonths(value, months) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid date");
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError("months must be a positive integer");
  }

  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

export function nextTicketNumber(channels) {
  let highest = 0;
  for (const channel of channels) {
    const match = /^ticket-(\d+)$/.exec(channel?.name ?? "");
    if (match) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  return highest + 1;
}

export function ticketTopic(userId, kind) {
  return `yetithumbs:user=${userId};kind=${kind}`;
}

export function isTicketForUser(channel, userId) {
  return String(channel?.topic ?? "").includes(`yetithumbs:user=${userId};`);
}

export function partnershipPartnerId(partner) {
  const id = String(partner?.id ?? "").trim();
  return id || null;
}

export function isMissingRpc(error) {
  return ["PGRST202", "42883"].includes(error?.code);
}

export function isMissingColumn(error) {
  return ["PGRST204", "42703"].includes(error?.code);
}
