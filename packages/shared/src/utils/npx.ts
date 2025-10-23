const NPX_COMMAND_NAMES = new Set(["npx", "npx.cmd", "npx.exe"]);

function isNpxCommand(command?: string): boolean {
  if (!command) {
    return false;
  }

  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (NPX_COMMAND_NAMES.has(normalized)) {
    return true;
  }

  return (
    normalized.endsWith("/npx") ||
    normalized.endsWith("\\npx") ||
    normalized.endsWith("/npx.cmd") ||
    normalized.endsWith("\\npx.cmd") ||
    normalized.endsWith("/npx.exe") ||
    normalized.endsWith("\\npx.exe")
  );
}

export function ensureNpxYesFlag(
  command?: string,
  args?: string[],
): string[] | undefined {
  if (!isNpxCommand(command) || !args || args.length === 0) {
    return args;
  }

  const hasYesFlag = args.some((arg) => {
    const normalized = arg.trim().toLowerCase();
    return (
      normalized === "-y" ||
      normalized === "--yes" ||
      normalized.startsWith("--yes=")
    );
  });

  if (hasYesFlag) {
    return args;
  }

  return ["-y", ...args];
}
