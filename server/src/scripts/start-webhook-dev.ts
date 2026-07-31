import ngrok from "@ngrok/ngrok";
import { config } from "dotenv";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

let serverProcess: ChildProcess | null = null;
let clientProcess: ChildProcess | null = null;
let syncProcess: ChildProcess | null = null;
let listener: Awaited<ReturnType<typeof ngrok.forward>> | null = null;
let shuttingDown = false;

function stopProcess(child: ChildProcess | null): void {
  if (!child?.pid) return;
  if (process.platform == "win32") {
    const result = spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
      stdio: "ignore",
      },
    );
    if (result.status != 0) child.kill("SIGTERM");
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  stopProcess(syncProcess);
  stopProcess(clientProcess);
  stopProcess(serverProcess);
  if (listener) await listener.close().catch(() => undefined);
  await ngrok.kill().catch(() => undefined);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const startClient = process.argv.includes("--client");
  const authtoken = process.env.NGROK_AUTHTOKEN?.trim() || "";
  const configuredDomain = process.env.NGROK_DOMAIN?.trim() || "";
  const port = Number(process.env.SERVER_PORT || 4000);

  if (!authtoken) {
    throw new Error("NGROK_AUTHTOKEN is required for dev:webhook");
  }
  if (!configuredDomain) {
    throw new Error("NGROK_DOMAIN is required for a stable Helius webhook URL");
  }
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SERVER_PORT must be a positive integer");
  }

  const domain = configuredDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!domain || domain.includes("/")) {
    throw new Error("NGROK_DOMAIN must be a hostname without a path");
  }

  const publicUrl = `https://${domain}`;
  const childEnvironment = {
    ...process.env,
    WEBHOOK_PUBLIC_URL: publicUrl,
  };

  serverProcess = spawn(
    process.platform == "win32" ? "npm.cmd" : "npm",
    ["run", "dev"],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      detached: process.platform != "win32",
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  serverProcess.once("exit", (code) => {
    if (!shuttingDown) void shutdown(code || 1);
  });

  if (startClient) {
    clientProcess = spawn(
      process.platform == "win32" ? "npm.cmd" : "npm",
      ["run", "dev"],
      {
        cwd: fileURLToPath(new URL("../../../client/", import.meta.url)),
        detached: process.platform != "win32",
        env: process.env,
        stdio: "inherit",
      },
    );
    clientProcess.once("exit", (code) => {
      if (!shuttingDown) void shutdown(code || 1);
    });
  }

  const localHealthUrl = `http://127.0.0.1:${port}/api`;
  let localReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(localHealthUrl);
      if (response.ok) {
        localReady = true;
        break;
      }
    } catch {
      // The development server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!localReady) {
    throw new Error(`Server did not become ready at ${localHealthUrl}`);
  }

  listener = await ngrok.forward({
    addr: port,
    authtoken,
    domain,
  });
  const listenerUrl = listener.url();
  if (!listenerUrl || listenerUrl != publicUrl) {
    throw new Error(
      `Ngrok returned ${listenerUrl || "no URL"}; expected ${publicUrl}`,
    );
  }

  let publicReady = false;
  let publicStatus = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${publicUrl}/api`);
      publicStatus = response.status;
      if (response.ok) {
        publicReady = true;
        break;
      }
    } catch {
      // A newly bound ngrok endpoint may take a moment to accept traffic.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!publicReady) {
    throw new Error(`Public health check failed with status ${publicStatus}`);
  }

  console.log(`[dev:webhook] tunnel ready: ${publicUrl} -> localhost:${port}`);
  console.log("[dev:webhook] synchronizing the managed Helius webhook");

  const spawnedSyncProcess = spawn(
    process.platform == "win32" ? "npm.cmd" : "npm",
    ["run", "alerts:sync-helius"],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      detached: process.platform != "win32",
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  syncProcess = spawnedSyncProcess;
  const syncExitCode = await new Promise<number>((resolve) => {
    spawnedSyncProcess.once("exit", (code) => resolve(code ?? 1));
  });
  syncProcess = null;
  if (syncExitCode != 0) {
    throw new Error("Helius synchronization failed");
  }

  console.log(
    `[dev:webhook] ready; press Ctrl+C to stop ${
      startClient ? "client, server and tunnel" : "server and tunnel"
    }`,
  );
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

void main().catch((error) => {
  console.error("[dev:webhook] startup failed", error);
  void shutdown(1);
});
