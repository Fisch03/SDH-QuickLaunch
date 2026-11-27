import { ServerAPI } from "decky-frontend-lib";
import { App, getLaunchOptions, getStartDir, getTarget, unquote } from "./apptypes";
import { getImagesForGame } from "./steamgriddb";
import { gameIDFromAppID, getShortcutID, createShortcut } from "./utils";
import { Settings } from "./settings";

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

async function getMatchingShortcutAppIds(sAPI: ServerAPI, desktopPath: string): Promise<number[]> {
  const res = await sAPI.callPluginMethod<{ desktop_path: string }, number[]>(
    "find_shortcut_appids",
    { desktop_path: desktopPath }
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
  excludeIds: Set<number> = new Set()
): Promise<number> {
  if (!SteamClient?.URL?.ExecuteSteamURL) {
    return -1;
  }

  const prep = await sAPI.callPluginMethod<any, boolean>("prepare_add_non_steam_game", {});
  if (!prep.success || !prep.result) {
    return -1;
  }

  SteamClient.URL.ExecuteSteamURL(`steam://addnonsteamgame/${encodeURIComponent(desktopPath)}`);

  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const appIds = await getMatchingShortcutAppIds(sAPI, desktopPath);
    const freshId = appIds.find((aid) => !excludeIds.has(aid));
    if (freshId && freshId > 0) {
      return freshId;
    }
  }

  // Steam may have reused an existing shortcut entry instead of creating a duplicate
  const appIds = await getMatchingShortcutAppIds(sAPI, desktopPath);
  return appIds.length > 0 ? appIds[appIds.length - 1] : -1;
}

export async function launchApp(sAPI: ServerAPI, app: App) {
  if (app.desktopPath && !app.compatTool) {
    const existingIds = await getMatchingShortcutAppIds(sAPI, app.desktopPath);
    const prevIdRes = await sAPI.callPluginMethod<any, number>("get_id", {});
    const prevId = prevIdRes.success && typeof prevIdRes.result === "number" ? prevIdRes.result : -1;

    // If a native shortcut for this .desktop already exists in Steam (either our [QL] shortcut
    // or a permanent shortcut), launch it directly without duplicating or modifying it.
    for (const existingId of existingIds) {
      const gid = gameIDFromAppID(existingId);
      if (gid !== -1) {
        SteamClient.Apps.RunGame(gid, "", -1, 100);
        return;
      }
    }

    // Remove the previous [QL] shortcut before creating a fresh native one so QuickLaunch
    // keeps at most one temporary [QL] entry in the library.
    if (prevId > 0 && gameIDFromAppID(prevId) !== -1) {
      SteamClient.Apps.RemoveShortcut(prevId);
    }

    const nativeId = await addShortcutFromDesktopFile(sAPI, app.desktopPath, new Set(existingIds));
    if (nativeId > 0) {
      const isNewShortcut = !existingIds.includes(nativeId);
      if (isNewShortcut) {
        sAPI.callPluginMethod("set_id", { id: nativeId });
        SteamClient.Apps.SetShortcutName(nativeId, `[QL] ${app.name}`);
      }
      const gid = await waitForGameID(nativeId);
      if (gid !== -1) {
        SteamClient.Apps.RunGame(gid, "", -1, 100);
        return;
      }
    }
  }

  let target = unquote(getTarget(app));
  let launchOptions = getLaunchOptions(app);
  let startDir = getStartDir(target);
  let id: number = await getShortcutID(sAPI, target, launchOptions);
  if (id === -1) return;

  SteamClient.Apps.SetShortcutName(id, `[QL] ${app.name}`);
  SteamClient.Apps.SetShortcutLaunchOptions(id, launchOptions);
  SteamClient.Apps.SetShortcutExe(id, `"${target}"`);
  SteamClient.Apps.SetShortcutStartDir(id, startDir);
  SteamClient.Apps.SpecifyCompatTool(id, app.compatTool === undefined ? "" : app.compatTool);

  if (app.desktopPath) {
    await sAPI.callPluginMethod("set_shortcut_path", {
      appid: id,
      desktop_path: app.desktopPath,
      icon: app.icon ?? "",
    });
  }

  setTimeout(() => {
    let gid = gameIDFromAppID(id);
    SteamClient.Apps.RunGame(gid, "", -1, 100);
  }, 500);
}

export async function createAppShortcut(
  sAPI: ServerAPI,
  app: App,
  settings: Settings,
  launchOptions?: string,
  target?: string
) {
  // For native .desktop / Flatpak entries without custom overrides, use Steam's native
  // steam://addnonsteamgame/ handler so ShortcutPath, icon, and launch options are set
  // identically to Desktop Mode "Add to Steam" without requiring a Steam restart.
  if (app.desktopPath && launchOptions === undefined && target === undefined) {
    const existingIds = await getMatchingShortcutAppIds(sAPI, app.desktopPath);
    const prevIdRes = await sAPI.callPluginMethod<any, number>("get_id", {});
    const prevId = prevIdRes.success && typeof prevIdRes.result === "number" ? prevIdRes.result : -1;

    const nativeId = await addShortcutFromDesktopFile(sAPI, app.desktopPath, new Set(existingIds));
    if (nativeId > 0) {
      if (nativeId === prevId) {
        // Promote the temporary [QL] shortcut into a permanent one
        sAPI.callPluginMethod("set_id", { id: -1 });
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

  setTimeout(() => {
    SteamClient.Apps.SetShortcutName(id, app.name);
    SteamClient.Apps.SetShortcutLaunchOptions(id, shortcutLaunchOptions);
    SteamClient.Apps.SetShortcutExe(id, `"${shortcutTarget}"`);
    SteamClient.Apps.SetShortcutStartDir(id, shortcutStartDir);
    SteamClient.Apps.SpecifyCompatTool(id, app.compatTool === undefined ? "" : app.compatTool);

    if (app.desktopPath) {
      setTimeout(() => {
        sAPI.callPluginMethod("set_shortcut_path", {
          appid: id,
          desktop_path: app.desktopPath,
          icon: app.icon ?? "",
        });
      }, 500);
    }
  }, 500);
}