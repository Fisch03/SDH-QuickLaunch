import { ServerAPI } from "decky-frontend-lib";
import { App, getLaunchOptions, getTarget } from "./apptypes";
import { getImagesForGame } from "./steamgriddb";
import { gameIDFromAppID, getShortcutID, createShortcut } from "./utils";
import { Settings } from "./settings";

export async function launchApp(sAPI: ServerAPI, app: App, compatTool?: string) {
  let id: number = await getShortcutID(sAPI);       
  
  SteamClient.Apps.SetShortcutName(id, `[QL] ${app.name}`)
  SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app))
  SteamClient.Apps.SetShortcutExe(id, `"${getTarget(app)}"`)
  SteamClient.Apps.SpecifyCompatTool(id, compatTool)

  setTimeout(() => {
      let gid = gameIDFromAppID(id);
      SteamClient.Apps.RunGame(gid,"",-1,100);
  }, 500)
}

export function createAppShortcut(sAPI: ServerAPI, app: App, settings: Settings, launchOptions?: string, target?: string, compatTool?: string) {
  let shortcutLaunchOptions = launchOptions === undefined ? getLaunchOptions(app) : launchOptions
  let shortcutTarget = target === undefined ? getTarget(app) : target
  createShortcut(app.name, shortcutLaunchOptions, shortcutTarget).then((id:number) => {
    if(settings.get("useGridDB")) {
      getImagesForGame(sAPI, settings.get("gridDBKey") ,app.name)
      .then(images => {
        if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, "png", 0);
        if(images.Hero !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
        if(images.Logo !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
        //if(images.Grid !== null) SteamClient.Apps.SetCustomArtworkForApp(id, images.GridH, "png", 3);
      })
      .catch(() => {}); //Maybe display error to the user in the future?
    }

    //This should theoretically not be needed with the new SteamClient.Apps.AddShortcut params but they seem to be pretty broken rn. It's not like it hurts either.
    setTimeout(() => {
      SteamClient.Apps.SetShortcutName(id, app.name);
      SteamClient.Apps.SetShortcutLaunchOptions(id, getLaunchOptions(app));
      SteamClient.Apps.SetShortcutExe(id, `"${getTarget(app)}"`);
      if (compatTool != null) SteamClient.Apps.SpecifyCompatTool(id, compatTool);
    }, 500)
  })
}