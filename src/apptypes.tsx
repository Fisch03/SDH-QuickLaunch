export interface App {
  name: string;
  exec: string;
  compatTool?: string;
  desktopPath?: string;
  icon?: string;
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function splitArgs(cmd: string): string[] {
  const args: string[] = [];
  let current = "";
  let hasToken = false;
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (inQuotes) {
      if (ch === "\\" && quoteChar === '"' && i + 1 < cmd.length) {
        current += cmd[++i];
      } else if (ch === quoteChar) {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === "\\" && i + 1 < cmd.length) {
        current += cmd[++i];
        hasToken = true;
      } else if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
        hasToken = true;
      } else if (/\s/.test(ch)) {
        if (hasToken) {
          args.push(current);
          current = "";
          hasToken = false;
        }
      } else {
        current += ch;
        hasToken = true;
      }
    }
  }

  if (hasToken) {
    args.push(current);
  }

  return args;
}

export function formatLaunchOptions(options: string): string {
  const args = splitArgs(options);
  if (args.length === 0) {
    return "";
  }
  return args
    .map((arg) => `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(" ");
}

function splitExec(exec: string): [string, string] {
  const trimmed = exec.trim();
  if (trimmed.length === 0) {
    return ["", ""];
  }

  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const endQuoteIndex = trimmed.indexOf(quote, 1);
    if (endQuoteIndex !== -1) {
      return [
        trimmed.slice(1, endQuoteIndex),
        trimmed.slice(endQuoteIndex + 1).trim(),
      ];
    }
  }

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    return [trimmed, ""];
  }

  return [trimmed.slice(0, firstSpace), trimmed.slice(firstSpace + 1).trim()];
}

export function getLaunchOptions(app: App): string {
  const rawOptions = splitExec(app.exec)[1];
  return formatLaunchOptions(rawOptions);
}

export function getTarget(app: App): string {
  return splitExec(app.exec)[0];
}

export function getStartDir(target: string): string {
  const cleanTarget = unquote(target);
  const lastSlash = cleanTarget.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return cleanTarget.slice(0, lastSlash + 1);
}