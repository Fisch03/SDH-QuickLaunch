import { ServerAPI } from "decky-frontend-lib";
import { App, getLaunchOptions, getStartDir, getTarget, unquote } from "./apptypes";
import { getImagesForGame } from "./steamgriddb";
import { gameIDFromAppID, getShortcutID, createShortcut } from "./utils";
import { Settings } from "./settings";

// Serialize shortcut launch/create operations so overlapping clicks cannot delete or
// overwrite another operation's temporary [QL] shortcut before its delayed steps finish.
let shortcutOpQueue: Promise<void> = Promise.resolve();

function enqueueShortcutOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = shortcutOpQueue.then(fn, fn);
  shortcutOpQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function getActiveAccountId(): string {
  try {
    const steam64 = (window as any)?.App?.m_CurrentUser?.strSteamID;
    if (steam64) {
      return BigInt.asUintN(32, BigInt(steam64)).toString();
    }
  } catch {
    // Return empty so VDF lookup/updates are skipped when active user is unavailable
  }
  return "";
}

function applyGridDBArtwork(sAPI: ServerAPI, settings: Settings, id: number, appName: string) {
  if (!settings.get("useGridDB")) return;

  getImagesForGame(sAPI, settings.get("gridDBKey"), appName)
    .then((images) => {
      if (images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, "png", 0);
      if (images.Hero !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
      if (images.Logo !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
    })
    .catch(() => {});
}

async function getMatchingShortcutAppIds(
  sAPI: ServerAPI,
  desktopPath: string,
  accountId: string
): Promise<number[]> {
  const res = await sAPI.callPluginMethod<{ desktop_path: string; account_id: string }, number[]>(
    "find_shortcut_appids",
    { desktop_path: desktopPath, account_id: accountId }
  );
  if (res.success && Array.isArray(res.result)) {
    return res.result;
  }
  return [];
}

async function waitForGameID(appid: number, maxAttempts: number = 20): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const gid = gameIDFromAppID(appid);
    if (gid !== -1) {
      return gid;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return -1;
}

async function addShortcutFromDesktopFile(
  sAPI: ServerAPI,
  desktopPath: string,
  accountId: string,
  excludeIds: Set<number> = new Set()
): Promise<number> {
  if (!SteamClient?.URL?.ExecuteSteamURL) {
    return -1;
  }

  // Create the /tmp/addnonsteamgamefile sentinel so Steam accepts the local .desktop path
  const prep = await sAPI.callPluginMethod<any, boolean>("prepare_add_non_steam_game", {});
  if (!prep.success || !prep.result) {
    return -1;
  }

  // Trigger Steam's native Desktop "Add to Steam" flow, which sets ShortcutPath in memory
  SteamClient.URL.ExecuteSteamURL(`steam://addnonsteamgame/${encodeURIComponent(desktopPath)}`);

  // Steam assigns the appid asynchronously and flushes shortcuts.vdf shortly after
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const appIds = await getMatchingShortcutAppIds(sAPI, desktopPath, accountId);
    const freshId = appIds.find((aid) => !excludeIds.has(aid));
    if (freshId && freshId > 0) {
      return freshId;
    }
  }

  // Steam may have reused an existing shortcut entry instead of creating a duplicate
  const appIds = await getMatchingShortcutAppIds(sAPI, desktopPath, accountId);
  return appIds.length > 0 ? appIds[appIds.length - 1] : -1;
}

async function getSavedShortcutId(sAPI: ServerAPI): Promise<number> {
  const res = await sAPI.callPluginMethod<any, number>("get_id", {});
  return res.success && typeof res.result === "number" ? res.result : -1;
}

async function clearSavedShortcut(sAPI: ServerAPI): Promise<void> {
  const prevId = await getSavedShortcutId(sAPI);
  if (prevId > 0 && gameIDFromAppID(prevId) !== -1) {
    SteamClient.Apps.RemoveShortcut(prevId);
    await sAPI.callPluginMethod("set_id", { id: -1 });
  }
}

function applyShortcutProperties(
  id: number,
  name: string,
  target: string,
  startDir: string,
  launchOptions: string,
  compatTool?: string
) {
  SteamClient.Apps.SetShortcutName(id, name);
  SteamClient.Apps.SetShortcutLaunchOptions(id, launchOptions);
  SteamClient.Apps.SetShortcutExe(id, `"${target}"`);
  SteamClient.Apps.SetShortcutStartDir(id, startDir);
  SteamClient.Apps.SpecifyCompatTool(id, compatTool ?? "");
}

export function launchApp(sAPI: ServerAPI, app: App): Promise<void> {
  return enqueueShortcutOp(async () => {
    const accountId = getActiveAccountId();

    if (app.desktopPath && !app.compatTool) {
      const existingIds = await getMatchingShortcutAppIds(sAPI, app.desktopPath, accountId);

      // If a native shortcut for this .desktop already exists in Steam (either our [QL] shortcut
      // or a permanent shortcut), launch it directly without duplicating or modifying it.
      for (const existingId of existingIds) {
        const gid = gameIDFromAppID(existingId);
        if (gid !== -1) {
          SteamClient.Apps.RunGame(gid, "", -1, 100);
          return;
        }
      }

      // Remove the previous [QL] shortcut so QuickLaunch keeps at most one temporary entry.
      await clearSavedShortcut(sAPI);

      const nativeId = await addShortcutFromDesktopFile(
        sAPI,
        app.desktopPath,
        accountId,
        new Set(existingIds)
      );
      if (nativeId > 0) {
        if (!existingIds.includes(nativeId)) {
          await sAPI.callPluginMethod("set_id", { id: nativeId });
          SteamClient.Apps.SetShortcutName(nativeId, `[QL] ${app.name}`);
        }
        const gid = await waitForGameID(nativeId);
        if (gid !== -1) {
          SteamClient.Apps.RunGame(gid, "", -1, 100);
          return;
        }
      }
    }

    // Remove the previous [QL] shortcut when switching to a non-.desktop file so it does not
    // retain a stale ShortcutPath in Steam.
    if (!app.desktopPath) {
      await clearSavedShortcut(sAPI);
    }

    let target = unquote(getTarget(app));
    let launchOptions = getLaunchOptions(app);
    let startDir = getStartDir(target);
    let id: number = await getShortcutID(sAPI, target, launchOptions);
    if (id === -1) return;

    applyShortcutProperties(id, `[QL] ${app.name}`, target, startDir, launchOptions, app.compatTool);

    if (app.desktopPath) {
      await sAPI.callPluginMethod("set_shortcut_path", {
        appid: id,
        desktop_path: app.desktopPath,
        icon: app.icon ?? "",
        account_id: accountId,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    SteamClient.Apps.RunGame(gameIDFromAppID(id), "", -1, 100);
  });
}

export function createAppShortcut(
  sAPI: ServerAPI,
  app: App,
  settings: Settings,
  launchOptions?: string,
  target?: string
): Promise<void> {
  return enqueueShortcutOp(async () => {
    const accountId = getActiveAccountId();

    // For native .desktop / Flatpak entries without custom overrides, use Steam's native
    // steam://addnonsteamgame/ handler so ShortcutPath, icon, and launch options are set
    // identically to Desktop Mode "Add to Steam" without requiring a Steam restart.
    if (app.desktopPath && !app.compatTool && launchOptions === undefined && target === undefined) {
      const existingIds = await getMatchingShortcutAppIds(sAPI, app.desktopPath, accountId);
      const prevId = await getSavedShortcutId(sAPI);

      const nativeId = await addShortcutFromDesktopFile(
        sAPI,
        app.desktopPath,
        accountId,
        new Set(existingIds)
      );
      if (nativeId > 0) {
        if (nativeId === prevId) {
          // Promote the temporary [QL] shortcut into a permanent one
          await sAPI.callPluginMethod("set_id", { id: -1 });
          SteamClient.Apps.SetShortcutName(nativeId, app.name);
        }
        applyGridDBArtwork(sAPI, settings, nativeId, app.name);
        return;
      }
    }

    let shortcutLaunchOptions = launchOptions === undefined ? getLaunchOptions(app) : launchOptions;
    let shortcutTarget = unquote(target === undefined ? getTarget(app) : target);
    let shortcutStartDir = getStartDir(shortcutTarget);

    const id: number = await createShortcut(app.name, shortcutTarget, shortcutLaunchOptions, shortcutStartDir);
    if (!id) return;

    applyGridDBArtwork(sAPI, settings, id, app.name);

    await new Promise((resolve) => setTimeout(resolve, 500));
    applyShortcutProperties(id, app.name, shortcutTarget, shortcutStartDir, shortcutLaunchOptions, app.compatTool);

    if (app.desktopPath) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await sAPI.callPluginMethod("set_shortcut_path", {
        appid: id,
        desktop_path: app.desktopPath,
        icon: app.icon ?? "",
        account_id: accountId,
      });
    }
  });
}