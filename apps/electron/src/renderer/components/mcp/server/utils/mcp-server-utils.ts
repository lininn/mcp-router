import { v4 as uuidv4 } from "uuid";
import type { MCPServerConfig } from "@mcp_router/shared";

/**
 * Validates a JSON input for MCP server configuration format
 * Works with both mcpServers object wrapper and direct server configurations
 *
 * @param jsonInput The JSON input string or object to validate
 * @returns Validation result with parsed data if valid
 */
export function validateMcpServerJson(jsonInput: string | object): {
  valid: boolean;
  error?: string;
  jsonData?: any;
  serverConfigs?: Record<string, any>;
} {
  try {
    // Parse JSON if input is a string
    const parsed =
      typeof jsonInput === "string" ? JSON.parse(jsonInput) : jsonInput;

    // Determine if the JSON has mcpServers wrapper or is a direct server config
    const mcpServers = parsed.mcpServers || parsed;

    if (typeof mcpServers !== "object" || mcpServers === null) {
      return { valid: false, error: "Invalid JSON format: Expected an object" };
    }

    const serverNames = Object.keys(mcpServers);

    if (serverNames.length === 0) {
      return { valid: false, error: "No server configurations found" };
    }

    // Check if at least one server has the required fields
    for (const serverName of serverNames) {
      const server = mcpServers[serverName];
      if (!server || typeof server !== "object") {
        return {
          valid: false,
          error: `Invalid server configuration for '${serverName}': Expected an object`,
        };
      }

      const hasCommand =
        typeof server.command === "string" && server.command.trim().length > 0;
      const typeValue =
        typeof server.type === "string" ? server.type.trim().toLowerCase() : "";
      const urlValue =
        typeof server.url === "string" && server.url.trim().length > 0
          ? server.url
          : typeof server.remoteUrl === "string" &&
              server.remoteUrl.trim().length > 0
            ? server.remoteUrl
            : undefined;
      const remoteTypes = new Set([
        "http",
        "sse",
        "remote",
        "remote-streamable",
        "streamable-http",
        "streamable_http",
      ]);
      const isRemoteLike =
        remoteTypes.has(typeValue) || (!hasCommand && !!urlValue);

      if (!hasCommand && !isRemoteLike) {
        return {
          valid: false,
          error: `Missing or invalid command for server '${serverName}'`,
        };
      }

      if (isRemoteLike && !urlValue) {
        return {
          valid: false,
          error: `Missing or invalid url for remote server '${serverName}'`,
        };
      }

      if (server.args !== undefined && !Array.isArray(server.args)) {
        return {
          valid: false,
          error: `Arguments must be an array for server '${serverName}'`,
        };
      }

      if (
        server.alwaysAllow !== undefined &&
        !Array.isArray(server.alwaysAllow)
      ) {
        return {
          valid: false,
          error: `alwaysAllow must be an array for server '${serverName}'`,
        };
      }

      if (
        server.neverAllow !== undefined &&
        !Array.isArray(server.neverAllow)
      ) {
        return {
          valid: false,
          error: `neverAllow must be an array for server '${serverName}'`,
        };
      }
    }

    return {
      valid: true,
      jsonData: parsed,
      serverConfigs: mcpServers,
    };
  } catch (error: any) {
    return {
      valid: false,
      error: `Invalid JSON: ${error.message}`,
    };
  }
}

/**
 * Processes MCP server configurations from validated JSON
 * Handles duplicate names by creating unique names
 *
 * @param serverConfigs The validated server configurations object
 * @param existingServerNames Set of existing server names to avoid duplicates
 * @returns Array of processed server configurations
 */
export function processMcpServerConfigs(
  serverConfigs: Record<string, any>,
  existingServerNames: Set<string>,
): Array<{
  name: string;
  originalName?: string;
  success: boolean;
  server?: any;
  message?: string;
}> {
  const results: Array<{
    name: string;
    originalName?: string;
    success: boolean;
    server?: any;
    message?: string;
  }> = [];

  // Clone the set to avoid modifying the original
  const currentNames = new Set(existingServerNames);

  // Process each server in the configuration
  for (const [serverName, serverConfig] of Object.entries(serverConfigs)) {
    try {
      // Ensure server config is an object
      if (!serverConfig || typeof serverConfig !== "object") {
        results.push({
          name: serverName,
          success: false,
          message: "Invalid server configuration",
        });
        continue;
      }

      // Generate a unique name if the server name already exists
      let uniqueName = serverName;
      let counter = 2;
      while (currentNames.has(uniqueName)) {
        uniqueName = `${serverName}-${counter}`;
        counter++;
      }

      // Add the unique name to our set to prevent duplicates within this batch
      currentNames.add(uniqueName);

      // Extract command, args, env, and transport information from the configuration
      const rawCommand =
        typeof serverConfig.command === "string"
          ? serverConfig.command.trim()
          : "";
      const argsArray = Array.isArray(serverConfig.args)
        ? serverConfig.args
            .map((arg: unknown) => String(arg).trim())
            .filter((arg) => arg.length > 0)
        : [];
      const envObject =
        serverConfig.env &&
        typeof serverConfig.env === "object" &&
        !Array.isArray(serverConfig.env)
          ? Object.entries(serverConfig.env).reduce(
              (acc, [key, value]) => {
                if (typeof value === "string") {
                  acc[key] = value;
                } else if (value !== undefined && value !== null) {
                  acc[key] = String(value);
                }
                return acc;
              },
              {} as Record<string, string>,
            )
          : {};
      const rawType =
        typeof serverConfig.type === "string"
          ? serverConfig.type.trim().toLowerCase()
          : "";
      const hasCommand = rawCommand.length > 0;
      const urlValue =
        typeof serverConfig.url === "string" &&
        serverConfig.url.trim().length > 0
          ? serverConfig.url.trim()
          : typeof serverConfig.remoteUrl === "string" &&
              serverConfig.remoteUrl.trim().length > 0
            ? serverConfig.remoteUrl.trim()
            : undefined;

      let serverType: "local" | "remote" | "remote-streamable" = "local";
      if (
        rawType === "streamable-http" ||
        rawType === "streamable_http" ||
        rawType === "remote-streamable"
      ) {
        serverType = "remote-streamable";
      } else if (
        rawType === "http" ||
        rawType === "sse" ||
        rawType === "remote"
      ) {
        serverType = "remote";
      } else if (!hasCommand && urlValue) {
        // Fallback: treat entries without command but with URL as remote SSE servers
        serverType = "remote";
      }

      const alwaysAllow = Array.isArray(serverConfig.alwaysAllow)
        ? serverConfig.alwaysAllow
            .map((item: unknown) =>
              typeof item === "string" ? item.trim() : "",
            )
            .filter((item) => item.length > 0)
        : [];
      const neverAllow = Array.isArray(serverConfig.neverAllow)
        ? serverConfig.neverAllow
            .map((item: unknown) =>
              typeof item === "string" ? item.trim() : "",
            )
            .filter((item) => item.length > 0)
        : [];

      const toolPermissions: Record<string, boolean> = {};
      alwaysAllow.forEach((tool) => {
        toolPermissions[tool] = true;
      });
      neverAllow.forEach((tool) => {
        if (!(tool in toolPermissions)) {
          toolPermissions[tool] = false;
        }
      });

      let rawAuthorization: string | undefined;
      if (typeof serverConfig.bearerToken === "string") {
        rawAuthorization = serverConfig.bearerToken;
      } else if (typeof serverConfig.authorization === "string") {
        rawAuthorization = serverConfig.authorization;
      } else if (
        serverConfig.headers &&
        typeof serverConfig.headers === "object" &&
        !Array.isArray(serverConfig.headers)
      ) {
        const headers = serverConfig.headers as Record<string, unknown>;
        const headerAuthorization =
          headers.Authorization ?? headers.authorization;
        if (typeof headerAuthorization === "string") {
          rawAuthorization = headerAuthorization;
        }
      }

      const normalizedBearerToken =
        typeof rawAuthorization === "string"
          ? rawAuthorization.replace(/^Bearer\s+/i, "").trim()
          : undefined;

      // Create MCPServerConfig object
      const mcpServerConfig: MCPServerConfig = {
        id: uuidv4(),
        name: uniqueName,
        env: envObject,
        autoStart:
          typeof serverConfig.autoStart === "boolean"
            ? serverConfig.autoStart
            : false,
        disabled:
          typeof serverConfig.disabled === "boolean"
            ? serverConfig.disabled
            : false,
        serverType,
      };

      if (serverConfig.description) {
        mcpServerConfig.description = serverConfig.description;
      }

      if (hasCommand) {
        mcpServerConfig.command = rawCommand;
      }

      if (argsArray.length > 0) {
        mcpServerConfig.args = argsArray;
      }

      if (serverType === "remote" || serverType === "remote-streamable") {
        if (urlValue) {
          mcpServerConfig.remoteUrl = urlValue;
        }
        if (normalizedBearerToken) {
          mcpServerConfig.bearerToken = normalizedBearerToken;
        }
      }

      if (Object.keys(toolPermissions).length > 0) {
        mcpServerConfig.toolPermissions = toolPermissions;
      }

      results.push({
        name: uniqueName,
        originalName: serverName !== uniqueName ? serverName : undefined,
        success: true,
        server: mcpServerConfig,
      });
    } catch (error: any) {
      results.push({
        name: serverName,
        success: false,
        message: `Error processing server: ${error.message}`,
      });
    }
  }

  return results;
}
