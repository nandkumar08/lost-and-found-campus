
const TIME_ZONE = 'Asia/Kolkata';

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  let input = String(value).trim().replace(' ', 'T');

  // Database timestamps without timezone are UTC.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input) &&
    !/(Z|[+-]\d{2}:\d{2})$/i.test(input)
  ) {
    input += 'Z';
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateOptions = {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function formatDate(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (!date) return String(value);

  return date.toLocaleDateString('en-GB', dateOptions);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = parseDate(value);
  if (!date) return String(value);

  return `${date.toLocaleDateString('en-GB', dateOptions)}, ${date.toLocaleTimeString(
    'en-GB',
    {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
  )}`;
}

export function formatTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

export function relativeTime(value) {
  if (!value) return '';
  const date = parseDate(value);
  if (!date) return '';

  const diff = (Date.now() - date.getTime()) / 1000;

  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d ago`;

  return formatDate(value);
}

export function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toLocalInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || '00';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value || '00';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function confidenceLabel(confidence) {
  return {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  }[confidence] || confidence;
}

export function firstName(fullName) {
  const parts = String(fullName || '')
    .replace(/\b(dr|prof|mr|mrs|ms|miss|smt|sri)\.?\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts.length ? parts[0] : 'there';
}
